<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import UserNav from '$lib/components/UserNav.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
	// 'uploading' shows a real byte-progress bar (the long part for big videos); 'finalizing' is the
	// indeterminate tail while the manual is saved and the job enqueued. With R2 configured the bytes
	// stream straight to R2 in parts (spec 20); otherwise they go through the server action. The
	// 'analyzing' phase lives on the manual page's status badge post-redirect.
	let uploadPhase = $state<'uploading' | 'finalizing'>('uploading');
	let uploadProgress = $state(0);
	// Client-side upload failure (network drop, a response we couldn't parse, or a direct-to-R2 error).
	// Server-side validation/upload errors still arrive via the `form` prop through applyAction.
	let clientError = $state<string | null>(null);
	const manuals = $derived(data.manuals ?? []);

	// Gallery retry/delete post to the manual route's own actions. We handle the result here
	// instead of letting use:enhance call its default update()/applyAction — that would apply the
	// *other* route's result to this page's `form` prop (which the upload card reads), surfacing
	// misleading errors in the upload UI. On success we refresh the list; on failure we show the
	// message in a gallery-local banner. Redirects (delete) just refresh — we stay on this page.
	let galleryError = $state<string | null>(null);
	async function handleGalleryResult(result: ActionResult): Promise<void> {
		if (result.type === 'failure') {
			const data = result.data as { error?: string } | undefined;
			galleryError = data?.error ?? null;
		} else if (result.type === 'error') {
			galleryError = result.error instanceof Error ? result.error.message : String(result.error);
		} else {
			galleryError = null;
			await invalidateAll();
		}
	}

	type CreatedUpload = {
		id: string;
		key: string;
		uploadId: string;
		partSize: number;
		partCount: number;
	};

	// The in-flight direct-to-R2 multipart upload, lifted to component state so the unload handler
	// can abort it if the user leaves mid-upload (the in-code `catch` abort never fires on a refresh).
	// Null whenever there is no multipart upload that still needs aborting (before create, after
	// complete, or once aborted).
	let activeUpload = $state<CreatedUpload | null>(null);
	type PartSig = { partNumber: number; url: string };

	async function postJson<T>(url: string, body: unknown): Promise<T> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const data: unknown = await res.json().catch(() => null);
			const detail =
				data && typeof data === 'object' && 'error' in data
					? String((data as { error: unknown }).error)
					: `request failed (${res.status})`;
			throw new Error(detail);
		}
		return res.json() as Promise<T>;
	}

	// PUT one chunk to its presigned R2 URL via XHR (so we get upload progress and can read the
	// ETag response header, which `fetch` can only surface when R2 CORS exposes it).
	function putPart(
		url: string,
		chunk: Blob,
		onProgress: (loaded: number) => void
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) onProgress(e.loaded);
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					const etag = xhr.getResponseHeader('ETag');
					if (etag) resolve(etag);
					else reject(new Error('R2 did not return an ETag (check bucket CORS ExposeHeaders)'));
				} else {
					reject(new Error(`part upload failed (${xhr.status})`));
				}
			};
			xhr.onerror = () => reject(new Error('network error during upload'));
			xhr.send(chunk);
		});
	}

	// Upload several parts at once. The old loop uploaded one part at a time, with a signing
	// round-trip between each: a single connection never saturates the uplink, and the link sat
	// idle during every sign — so a large video crawled and the progress bar appeared to freeze
	// at each part boundary. A small worker pool keeps multiple parts in flight (and a part
	// signing while others transfer), which is the actual fix for "slow and stalls". 4 stays
	// within browsers' per-host socket limits without overwhelming a modest uplink.
	const UPLOAD_CONCURRENCY = 4;
	// Retry a part a few times on a transient network error before failing the whole upload, so a
	// single dropped chunk can't abort a multi-GB transfer that was otherwise fine.
	const PART_MAX_ATTEMPTS = 3;

	// Presigned PUT URL for one part. Signed *just before* its own upload (even with concurrency):
	// signing all parts up front let a large upload outlive the URL TTL, so later parts 403'd with
	// "Request has expired". Per-part signing bounds each URL's lifetime to one part's transfer.
	async function signPart(created: CreatedUpload, partNumber: number): Promise<string> {
		const { parts } = await postJson<{ parts: PartSig[] }>('/api/uploads/sign', {
			key: created.key,
			uploadId: created.uploadId,
			partNumbers: [partNumber]
		});
		const sig = parts?.find((p) => p.partNumber === partNumber);
		if (!sig?.url) throw new Error(`no presigned URL returned for part ${partNumber}`);
		return sig.url;
	}

	async function uploadParts(file: File, created: CreatedUpload) {
		const completed: { partNumber: number; etag: string }[] = new Array(created.partCount);
		// Bytes transferred per part, summed for the progress bar. A flat per-part array (not a
		// single running total) keeps progress correct while several parts upload concurrently and
		// when a part restarts after a failed attempt.
		const loadedByPart = new Array<number>(created.partCount).fill(0);
		const reportProgress = (): void => {
			const total = loadedByPart.reduce((sum, n) => sum + n, 0);
			uploadProgress = Math.round((total / file.size) * 100);
		};

		async function uploadOne(partNumber: number): Promise<void> {
			const start = (partNumber - 1) * created.partSize;
			const chunk = file.slice(start, Math.min(start + created.partSize, file.size));
			let lastError: unknown;
			for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
				try {
					const url = await signPart(created, partNumber);
					const etag = await putPart(url, chunk, (loaded) => {
						loadedByPart[partNumber - 1] = loaded;
						reportProgress();
					});
					loadedByPart[partNumber - 1] = chunk.size;
					reportProgress();
					completed[partNumber - 1] = { partNumber, etag };
					return;
				} catch (e) {
					lastError = e;
					// A failed attempt transferred nothing usable; reset so progress doesn't overcount.
					loadedByPart[partNumber - 1] = 0;
					reportProgress();
				}
			}
			throw lastError instanceof Error ? lastError : new Error(String(lastError));
		}

		// Worker pool: a fixed set of workers each pull the next part number until the file is fully
		// uploaded. `nextPart++` is atomic in single-threaded JS, so no two workers claim the same
		// part. Bounded so we never open more sockets than the browser/R2 are comfortable with.
		let nextPart = 1;
		const worker = async (): Promise<void> => {
			for (let n = nextPart++; n <= created.partCount; n = nextPart++) {
				await uploadOne(n);
			}
		};
		const workerCount = Math.min(UPLOAD_CONCURRENCY, created.partCount);
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
		return completed;
	}

	// Direct browser→R2 path (spec 20): stream the bytes to R2 in parts (real progress), then submit
	// the action with the object key instead of the video. `body` still carries the aux files.
	async function directSubmit(action: string, body: FormData, file: File): Promise<void> {
		try {
			const created = await postJson<CreatedUpload>('/api/uploads/create', {
				filename: file.name,
				contentType: file.type,
				size: file.size
			});
			activeUpload = created;
			const parts = await uploadParts(file, created);
			uploadPhase = 'finalizing';
			await postJson('/api/uploads/complete', {
				key: created.key,
				uploadId: created.uploadId,
				parts
			});
			// The parts are now assembled into a real object; there is no longer a multipart upload
			// to abort, so clear it before the action runs (and before any later unload).
			activeUpload = null;

			// Hand off to the action: drop the bytes, pass the R2 key + original name.
			body.delete('video');
			body.set('videoKey', created.key);
			body.set('videoName', file.name);
			const response = await fetch(action, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize(await response.text()) as ActionResult;
			await applyAction(result);
			// A successful upload redirects (applyAction navigates away); only re-enable otherwise.
			if (result.type !== 'redirect') submitting = false;
		} catch (e) {
			if (activeUpload) {
				// Best-effort: don't leave orphaned parts billing in R2.
				const { key, uploadId } = activeUpload;
				activeUpload = null;
				void postJson('/api/uploads/abort', { key, uploadId }).catch(() => {});
			}
			clientError = m.error_upload_failed({ message: e instanceof Error ? e.message : String(e) });
			submitting = false;
		}
	}

	// Guard against losing an in-flight upload to a refresh/close: warn before the page tears down,
	// and — if it tears down anyway — fire a best-effort beacon to abort the multipart upload so R2
	// doesn't bill for the orphaned parts. The beacon survives unload where `fetch` would be killed;
	// the R2 lifecycle rule (scripts/set-r2-lifecycle.mjs) is the backstop if even the beacon is lost.
	function onBeforeUnload(event: BeforeUnloadEvent): void {
		if (!activeUpload) return;
		event.preventDefault();
		// Legacy browsers need returnValue set to trigger the native "Leave site?" confirmation.
		event.returnValue = '';
	}

	function onPageHide(): void {
		if (!activeUpload) return;
		const payload = JSON.stringify({ key: activeUpload.key, uploadId: activeUpload.uploadId });
		navigator.sendBeacon('/api/uploads/abort', new Blob([payload], { type: 'application/json' }));
	}

	// Submit via XHR (not use:enhance) so we can surface real upload progress — fetch can't report it.
	// The response is still a SvelteKit ActionResult, so we deserialize + applyAction to keep the
	// server redirect and form-failure handling intact. With R2 configured the video instead streams
	// directly to R2 (directSubmit) and only the key + aux files go through the action.
	function handleUpload(event: SubmitEvent): void {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		const body = new FormData(formEl);

		submitting = true;
		uploadPhase = 'uploading';
		uploadProgress = 0;
		clientError = null;

		if (data.directUpload) {
			const file = body.get('video');
			if (file instanceof File && file.size > 0) {
				void directSubmit(formEl.action, body, file);
				return;
			}
		}

		const xhr = new XMLHttpRequest();
		xhr.open('POST', formEl.action);
		xhr.setRequestHeader('x-sveltekit-action', 'true');

		xhr.upload.addEventListener('progress', (e) => {
			if (!e.lengthComputable) return;
			uploadProgress = Math.round((e.loaded / e.total) * 100);
			if (uploadProgress >= 100) uploadPhase = 'finalizing';
		});
		xhr.upload.addEventListener('load', () => {
			uploadPhase = 'finalizing';
		});

		xhr.addEventListener('load', async () => {
			// The body should be a serialized SvelteKit ActionResult, but a proxy/error page or an
			// empty/non-2xx response would make deserialize throw — never leave the UI stuck in the
			// progress state. Surface a generic failure and re-enable the form on any parse/apply error.
			try {
				const result = deserialize(xhr.responseText) as ActionResult;
				await applyAction(result);
				// A successful upload redirects (applyAction navigates away); only re-enable otherwise.
				if (result.type !== 'redirect') submitting = false;
			} catch {
				clientError = m.error_upload_interrupted();
				submitting = false;
			}
		});
		xhr.addEventListener('error', () => {
			clientError = m.error_upload_interrupted();
			submitting = false;
		});

		xhr.send(body);
	}

	const pipeline = [
		{ title: m.home_pipeline_upload_title(), desc: m.home_pipeline_upload_desc() },
		{ title: m.home_pipeline_media_title(), desc: m.home_pipeline_media_desc() },
		{ title: m.home_pipeline_segment_title(), desc: m.home_pipeline_segment_desc() },
		{ title: m.home_pipeline_draft_title(), desc: m.home_pipeline_draft_desc() },
		{ title: m.home_pipeline_review_title(), desc: m.home_pipeline_review_desc() },
		{ title: m.home_pipeline_export_title(), desc: m.home_pipeline_export_desc() }
	];

	// Only step 0 (upload) is live on this page — steps 1–5 run after the redirect and surface on the
	// manual page's own stage progress bar. So the pipeline reflects the upload lifecycle: the first
	// step pulses while bytes stream (and during finalize), turns red if the upload fails, and the
	// rest stay 'upcoming'. `uploadError` covers both client-side failures and server-side action
	// errors. `submitting` wins over `uploadError`: a server-side `form.error` can land mid-applyAction
	// before the handler resets `submitting`, so we keep showing 'active' until the form is re-enabled,
	// then surface 'failed' — never flip to failed while the upload UI still reads as in-progress.
	type StepState = 'active' | 'failed' | 'upcoming';
	const uploadError = $derived(form?.error ?? clientError ?? null);
	function stepState(i: number): StepState {
		if (i !== 0) return 'upcoming';
		if (submitting) return 'active';
		if (uploadError) return 'failed';
		return 'upcoming';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString(getLocale(), {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const statusColors: Record<string, string> = {
		uploaded: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
		processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse',
		ready: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
		failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
	};

	const statusLabels: Record<string, () => string> = {
		uploaded: m.status_uploaded,
		processing: m.status_processing,
		ready: m.status_ready,
		failed: m.status_failed
	};
</script>

<svelte:head>
	<title>{m.home_page_title()}</title>
</svelte:head>

<!-- Only attach beforeunload while a multipart upload is in flight: a permanently-registered
	beforeunload listener warns on every submit and disables the browser's bfcache even when idle.
	pagehide is bfcache-safe and self-guards, so it can stay attached. -->
<svelte:window onbeforeunload={activeUpload ? onBeforeUnload : undefined} onpagehide={onPageHide} />

<div class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white">
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<main class="relative mx-auto max-w-6xl px-6 py-16 lg:py-24">
		<!-- User Profile Nav -->
		<div class="flex flex-wrap justify-between items-center gap-x-4 gap-y-3 mb-8">
			<Logo size={30} />
			<UserNav session={data.session} />
		</div>

		<!-- Header -->
		<header class="mb-16 text-center lg:text-left space-y-4">
			<div
				class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60 text-xs font-semibold tracking-wider text-slate-400 uppercase"
			>
				<span class="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
				{m.brand_tagline()}
			</div>
			<h1
				class="text-4xl lg:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent"
			>
				{m.home_hero_title()}
			</h1>
			<p class="max-w-2xl text-lg text-slate-400">
				{m.home_hero_subtitle()}
			</p>
		</header>

		<!-- Main Layout Grid -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
			<!-- Left side: Upload and Pipeline -->
			<div class="lg:col-span-5 space-y-8">
				<!-- Upload Card -->
				<section
					class="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl relative overflow-hidden group"
				>
					<div
						class="absolute -right-16 -top-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500"
					></div>

					<h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
						<svg
							class="w-5 h-5 text-indigo-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
							/></svg
						>
						{m.home_upload_title()}
					</h2>

					<form
						method="POST"
						enctype="multipart/form-data"
						class="space-y-5"
						onsubmit={handleUpload}
					>
						<!-- Video Input -->
						<div class="space-y-1.5">
							<label
								for="video"
								class="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
								>{m.home_field_video()} *</label
							>
							<div class="relative">
								<input
									id="video"
									type="file"
									name="video"
									accept="video/*"
									required
									class="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:transition-all rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 hover:border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
								/>
							</div>
						</div>

						<!-- BOM Input -->
						<div class="space-y-1.5">
							<label
								for="bom"
								class="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
							>
								{m.home_field_bom()} <span class="text-slate-600">{m.home_field_bom_hint()}</span>
							</label>
							<input
								id="bom"
								type="file"
								name="bom"
								accept=".csv,text/csv"
								class="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 file:transition-all rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 hover:border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
							/>
						</div>

						<!-- CAD Input -->
						<div class="space-y-1.5">
							<label
								for="model"
								class="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
							>
								{m.home_field_model()}
								<span class="text-slate-600">{m.home_field_model_hint()}</span>
							</label>
							<input
								id="model"
								type="file"
								name="model"
								accept=".step,.stp,.obj,.stl"
								class="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 file:transition-all rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 hover:border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
							/>
						</div>

						{#if submitting}
							<div class="space-y-2" aria-live="polite">
								<div class="flex items-center justify-between text-xs font-semibold">
									<span class="flex items-center gap-2 text-slate-200">
										<svg
											class="animate-spin h-4 w-4 text-indigo-400"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										{uploadPhase === 'uploading'
											? m.home_upload_phase_uploading()
											: m.home_upload_phase_finalizing()}
									</span>
									{#if uploadPhase === 'uploading'}
										<span class="text-slate-400 tabular-nums">{uploadProgress}%</span>
									{/if}
								</div>
								<div
									class="h-2 w-full overflow-hidden rounded-full bg-slate-800"
									role="progressbar"
									aria-label={uploadPhase === 'uploading'
										? m.home_upload_phase_uploading()
										: m.home_upload_phase_finalizing()}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={uploadPhase === 'uploading' ? uploadProgress : undefined}
									aria-valuetext={uploadPhase === 'uploading'
										? `${uploadProgress}%`
										: m.home_upload_phase_finalizing()}
								>
									<div
										class={`h-full rounded-full bg-indigo-500 transition-all duration-200 ${uploadPhase === 'finalizing' ? 'animate-pulse' : ''}`}
										style={`width: ${uploadPhase === 'finalizing' ? 100 : uploadProgress}%`}
									></div>
								</div>
								<p class="text-[11px] text-slate-500">{m.home_upload_phase_hint()}</p>
							</div>
						{:else}
							<button
								type="submit"
								class="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-3 px-4 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
							>
								{m.home_upload_submit()}
							</button>
						{/if}

						{#if form?.error || clientError}
							<div
								class="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2"
								role="alert"
							>
								<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/></svg
								>
								{form?.error ?? clientError}
							</div>
						{/if}
					</form>
				</section>

				<!-- Pipeline steps -->
				<section class="space-y-4">
					<h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest">
						{m.home_pipeline_heading()}
					</h2>
					<div class="relative pl-6 border-l border-slate-900 space-y-5">
						{#each pipeline as step, i (step.title)}
							{@const state = stepState(i)}
							<div class="relative">
								<div
									class={`absolute -left-[30px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-slate-950 text-[10px] font-bold transition-colors ${
										state === 'active'
											? 'border-indigo-500/60 text-indigo-300'
											: state === 'failed'
												? 'border-rose-500/60 text-rose-400'
												: 'border-slate-800 text-slate-500'
									}`}
									aria-label={state === 'active'
										? m.home_pipeline_status_active()
										: state === 'failed'
											? m.home_pipeline_status_failed()
											: undefined}
								>
									{#if state === 'active'}
										<svg
											class="h-3 w-3 animate-spin"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
									{:else if state === 'failed'}
										<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="3"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									{:else}
										{i + 1}
									{/if}
								</div>
								<h3
									class={`text-xs font-semibold transition-colors ${
										state === 'active'
											? 'text-indigo-200'
											: state === 'failed'
												? 'text-rose-300'
												: 'text-slate-200'
									}`}
								>
									{step.title}
								</h3>
								<p class="text-[11px] text-slate-500 leading-relaxed">{step.desc}</p>
								{#if state === 'active'}
									<p class="text-[11px] font-semibold text-indigo-400/90">
										{m.home_pipeline_status_active()}
									</p>
								{:else if state === 'failed'}
									<p class="text-[11px] font-semibold text-rose-400">
										{m.home_pipeline_status_failed()}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			</div>

			<!-- Right side: Live Manuals Gallery -->
			<div class="lg:col-span-7 space-y-6">
				<h2
					class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"
				>
					{m.home_gallery_heading()}
					<span
						class="px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900 text-[10px] font-semibold text-slate-400"
					>
						{m.home_gallery_total({ count: manuals.length })}
					</span>
				</h2>

				{#if manuals.length === 0}
					<div
						class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 p-12 text-center space-y-3"
					>
						<div
							class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-400"
						>
							<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 4v16M17 4v16M3 8h18M3 16h18"
								/></svg
							>
						</div>
						<p class="text-sm font-semibold text-slate-300">{m.home_gallery_empty_title()}</p>
						<p class="text-xs text-slate-500">
							{m.home_gallery_empty_body()}
						</p>
					</div>
				{:else}
					{#if galleryError}
						<div
							class="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400"
						>
							{galleryError}
						</div>
					{/if}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each manuals as manual (manual.id)}
							<div
								class="rounded-xl border border-slate-900 hover:border-slate-800/80 bg-slate-900/20 hover:bg-slate-900/40 shadow-lg transition-all group relative overflow-hidden"
							>
								<a
									href={resolve(`/manuals/${manual.id}`)}
									class="block p-5 active:scale-[0.99] transition-transform"
								>
									<!-- Hover subtle blue glow -->
									<div
										class="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/1 group-hover:to-indigo-500/5 transition-all duration-300 pointer-events-none"
									></div>

									<div class="flex flex-col h-full justify-between gap-4">
										<div>
											<div class="flex items-center justify-between gap-2 mb-2">
												<span class="text-[10px] font-medium text-slate-500">
													{formatDate(manual.createdAt)}
												</span>
												<span
													class={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${statusColors[manual.status] || 'bg-slate-900 text-slate-400 border-slate-800'}`}
												>
													{statusLabels[manual.status]?.() ?? manual.status}
												</span>
											</div>

											<h3
												class="text-sm font-bold text-slate-200 group-hover:text-white line-clamp-2 transition-colors"
											>
												{manual.title}
											</h3>
										</div>

										<div
											class="flex items-center justify-between border-t border-slate-950 pt-3 text-[11px] text-slate-500"
										>
											<div class="flex items-center gap-1">
												<svg
													class="w-3.5 h-3.5 text-slate-600"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
													/></svg
												>
												<span>{m.home_card_steps({ count: manual.steps?.length ?? 0 })}</span>
											</div>
											<span
												class="text-indigo-400/80 group-hover:text-indigo-400 font-semibold inline-flex items-center gap-0.5 transition-colors"
											>
												{m.home_card_view()}
												<svg
													class="w-3 h-3 transition-transform group-hover:translate-x-0.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M9 5l7 7-7 7"
													/></svg
												>
											</span>
										</div>
									</div>
								</a>

								{#if manual.status === 'failed'}
									<!-- Recover a failed run without opening it: retry re-queues processing,
								     delete removes it. Both POST to the manual route's guarded actions. -->
									<div
										class="flex items-center gap-2 border-t border-slate-950 px-5 py-3 relative z-10"
									>
										<form
											method="POST"
											action={`/manuals/${manual.id}?/retry`}
											use:enhance={() => {
												galleryError = null;
												return async ({ result }) => handleGalleryResult(result);
											}}
										>
											<button
												type="submit"
												class="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-300 transition-all hover:border-indigo-500/60 hover:bg-indigo-500/15 cursor-pointer"
											>
												{m.editor_retry()}
											</button>
										</form>
										<form
											method="POST"
											action={`/manuals/${manual.id}?/delete`}
											use:enhance={({ cancel }) => {
												if (!confirm(m.editor_delete_confirm())) {
													cancel();
													return;
												}
												galleryError = null;
												return async ({ result }) => handleGalleryResult(result);
											}}
										>
											<button
												type="submit"
												class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-300 transition-all hover:border-rose-500/60 hover:bg-rose-500/15 cursor-pointer"
											>
												{m.editor_delete()}
											</button>
										</form>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
