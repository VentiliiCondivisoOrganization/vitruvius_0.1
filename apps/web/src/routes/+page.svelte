<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
	// null until the browser starts pushing bytes to R2, then 0–100 (spec 20 direct upload).
	let uploadPercent = $state<number | null>(null);
	// Errors raised by the client-side direct-upload flow (the action's errors arrive via `form`).
	let uploadError = $state<string | null>(null);
	const manuals = $derived(data.manuals ?? []);
	const errorMessage = $derived(uploadError ?? form?.error ?? null);

	type CreatedUpload = {
		id: string;
		key: string;
		uploadId: string;
		partSize: number;
		partCount: number;
	};
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

	async function uploadParts(file: File, created: CreatedUpload) {
		const partNumbers = Array.from({ length: created.partCount }, (_, i) => i + 1);
		const { parts: signatures } = await postJson<{ parts: PartSig[] }>('/api/uploads/sign', {
			key: created.key,
			uploadId: created.uploadId,
			partNumbers
		});

		const completed: { partNumber: number; etag: string }[] = [];
		let uploadedBytes = 0;
		for (const { partNumber, url } of signatures) {
			const start = (partNumber - 1) * created.partSize;
			const chunk = file.slice(start, Math.min(start + created.partSize, file.size));
			const etag = await putPart(url, chunk, (loaded) => {
				uploadPercent = Math.round(((uploadedBytes + loaded) / file.size) * 100);
			});
			uploadedBytes += chunk.size;
			uploadPercent = Math.round((uploadedBytes / file.size) * 100);
			completed.push({ partNumber, etag });
		}
		return completed;
	}

	// Direct browser→R2 path (spec 20): upload the bytes straight to R2, then submit the form
	// action with the object key instead of the video. `formData` still carries the aux files.
	async function directSubmit(formData: FormData, file: File) {
		submitting = true;
		uploadError = null;
		uploadPercent = 0;
		let created: CreatedUpload | null = null;
		try {
			created = await postJson<CreatedUpload>('/api/uploads/create', {
				filename: file.name,
				contentType: file.type,
				size: file.size
			});
			const parts = await uploadParts(file, created);
			await postJson('/api/uploads/complete', {
				key: created.key,
				uploadId: created.uploadId,
				parts
			});

			// Hand off to the existing action: drop the bytes, pass the R2 key + original name.
			formData.delete('video');
			formData.set('videoKey', created.key);
			formData.set('videoName', file.name);
			const response = await fetch('?/default', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: formData
			});
			// applyAction handles every result type, including performing the action's redirect.
			await applyAction(deserialize(await response.text()));
		} catch (e) {
			if (created) {
				// Best-effort: don't leave orphaned parts billing in R2.
				void postJson('/api/uploads/abort', { key: created.key, uploadId: created.uploadId }).catch(
					() => {}
				);
			}
			uploadError = m.error_upload_failed({ message: e instanceof Error ? e.message : String(e) });
		} finally {
			submitting = false;
			uploadPercent = null;
		}
	}

	const pipeline = [
		{ title: m.home_pipeline_upload_title(), desc: m.home_pipeline_upload_desc() },
		{ title: m.home_pipeline_media_title(), desc: m.home_pipeline_media_desc() },
		{ title: m.home_pipeline_segment_title(), desc: m.home_pipeline_segment_desc() },
		{ title: m.home_pipeline_draft_title(), desc: m.home_pipeline_draft_desc() },
		{ title: m.home_pipeline_review_title(), desc: m.home_pipeline_review_desc() },
		{ title: m.home_pipeline_export_title(), desc: m.home_pipeline_export_desc() }
	];

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

<div class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white">
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<main class="relative mx-auto max-w-6xl px-6 py-16 lg:py-24">
		<!-- User Profile Nav -->
		<div class="flex justify-between items-center gap-4 mb-8">
			<Logo size={30} />
			<div class="flex items-center gap-4">
				<LanguageSwitcher />
				{#if data.session?.user}
					<span class="text-sm text-slate-400">{data.session.user.email}</span>
					<a
						href={resolve('/settings')}
						class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition font-semibold"
					>
						{m.nav_settings()}
					</a>
					<form action="/logout" method="POST">
						<button
							type="submit"
							class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer font-semibold"
						>
							{m.nav_log_out()}
						</button>
					</form>
				{/if}
			</div>
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
						use:enhance={({ formData, cancel }) => {
							// With R2 configured, upload the video straight to R2 (spec 20) and submit the
							// action ourselves; otherwise fall through to the server-proxied enhanced submit.
							if (data.directUpload) {
								const file = formData.get('video');
								if (file instanceof File && file.size > 0) {
									cancel();
									void directSubmit(formData, file);
									return;
								}
							}
							submitting = true;
							return async ({ update }) => {
								try {
									await update();
								} finally {
									submitting = false;
								}
							};
						}}
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

						<button
							type="submit"
							disabled={submitting}
							class="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-3 px-4 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
						>
							{#if submitting}
								<svg
									class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
								{uploadPercent !== null
									? m.home_upload_uploading({ percent: uploadPercent })
									: m.home_upload_submitting()}
							{:else}
								{m.home_upload_submit()}
							{/if}
						</button>

						{#if uploadPercent !== null}
							<div class="space-y-1.5">
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
									<div
										class="h-full rounded-full bg-indigo-500 transition-all duration-200"
										style="width: {uploadPercent}%"
									></div>
								</div>
								<p class="text-[11px] text-slate-500">
									{m.home_upload_uploading({ percent: uploadPercent })}
								</p>
							</div>
						{/if}

						{#if errorMessage}
							<div
								class="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2"
							>
								<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/></svg
								>
								{errorMessage}
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
							<div class="relative">
								<div
									class="absolute -left-[30px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-500"
								>
									{i + 1}
								</div>
								<h3 class="text-xs font-semibold text-slate-200">{step.title}</h3>
								<p class="text-[11px] text-slate-500 leading-relaxed">{step.desc}</p>
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
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each manuals as manual (manual.id)}
							<a
								href={resolve(`/manuals/${manual.id}`)}
								class="block rounded-xl border border-slate-900 hover:border-slate-800/80 bg-slate-900/20 hover:bg-slate-900/40 p-5 shadow-lg active:scale-[0.99] transition-all group relative overflow-hidden"
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
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
