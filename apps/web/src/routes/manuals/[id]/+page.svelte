<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import {
		PROCESS_STAGE,
		REGENERATE_SCOPE,
		STEP_REVIEW_STATUS,
		emptyPartRef,
		partRefHasOpenCandidates,
		resolvePartRefBomCandidate,
		type ManualBomItem,
		type ManualStep,
		type PartRef,
		type ProcessStage,
		type StepReviewStatus
	} from '@vitruvius/core';
	import BomPartPicker from './BomPartPicker.svelte';
	import { m } from '$lib/paraglide/messages';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const manual = $derived(data.manual);
	const isReady = $derived(manual.status === 'ready');

	// ---- Versioning (spec 17) ----------------------------------------------
	// Only the head of a lineage is editable; older versions are read-only snapshots
	// (still exportable). The switcher lets the user jump between versions.
	const versions = $derived(data.versions);
	const readOnly = $derived(!data.isHead);
	let enriching = $state(false);

	// ---- Retry / delete (failed manuals) -----------------------------------
	let retrying = $state(false);
	let deleting = $state(false);

	// ---- Auto-refresh for non-ready manuals ---------------------------------
	const failed = $derived(manual.status === 'failed');
	$effect(() => {
		if (!isReady && !failed) {
			const interval = setInterval(() => {
				invalidateAll();
			}, 3000);
			return () => clearInterval(interval);
		}
	});

	// ---- Status view (non-ready manuals) -----------------------------------
	// The engine reports its current ProcessStage (spec 07); the status view renders the whole
	// ordered pipeline as a checklist and derives each row's state from that reported position.
	// `stageIndex` is -1 until the engine reports one (queued / just-started → all rows upcoming).
	const progressStage = $derived(data.progressStage as ProcessStage | null);
	const stageIndex = $derived(progressStage ? PROCESS_STAGE.indexOf(progressStage) : -1);
	const stagePct = $derived(
		stageIndex >= 0 ? Math.round(((stageIndex + 1) / PROCESS_STAGE.length) * 100) : 0
	);

	// Per-stage state for the checklist. While processing, the reported stage is `active` and the
	// ones before it `done`. On failure, the reported stage is where the run died (`failed`) with
	// earlier stages `done`; if the engine never reported a stage (stageIndex < 0) we can't point
	// at one, so every row stays `upcoming` and the error banner alone explains the failure.
	type StageState = 'done' | 'active' | 'failed' | 'upcoming';
	function stageState(i: number): StageState {
		if (failed) {
			if (stageIndex < 0) return 'upcoming';
			if (i < stageIndex) return 'done';
			return i === stageIndex ? 'failed' : 'upcoming';
		}
		if (stageIndex < 0) return 'upcoming';
		if (i < stageIndex) return 'done';
		return i === stageIndex ? 'active' : 'upcoming';
	}
	const stageLabels: Record<ProcessStage, () => string> = {
		priming: m.manual_stage_priming,
		media: m.manual_stage_media,
		segmenting: m.manual_stage_segmenting,
		bom: m.manual_stage_bom,
		instructing: m.manual_stage_instructing,
		critiquing: m.manual_stage_critiquing,
		illustrating: m.manual_stage_illustrating,
		finalizing: m.manual_stage_finalizing
	};

	// ---- Editor view (ready manuals) ---------------------------------------
	let steps = $state<ManualStep[]>([]);
	let dirty = $state(false);
	let saving = $state(false);
	let seededId = $state<string | null>(null);

	$effect(() => {
		const m = manual;
		if (m.id !== seededId) {
			steps = structuredClone($state.snapshot(m.steps)) as ManualStep[];
			seededId = m.id;
			dirty = false;
			return;
		}
		if (!dirty && !saving) {
			steps = structuredClone($state.snapshot(m.steps)) as ManualStep[];
		}
	});

	function markDirty(): void {
		dirty = true;
	}

	// ---- AI regeneration (spec 16) -----------------------------------------
	// Enqueues a `regenerate` job for one step; the engine reuses Instructor/Illustrator.
	// `structure` splits the selected step engine-side (split/merge); re-segmentation from
	// the source video stays an explicit opt-in not offered here.
	let regenerating = $state(false);
	const regenScopes = REGENERATE_SCOPE;
	const regenScopeLabels: Record<string, string> = {
		text: m.editor_scope_text(),
		illustration: m.editor_scope_illustration(),
		layout: m.editor_scope_layout(),
		structure: m.editor_scope_structure()
	};

	const reviewLabels: Record<StepReviewStatus, string> = {
		hypothesis: m.review_hypothesis(),
		confirmed: m.review_confirmed(),
		edited: m.review_edited()
	};

	const reviewStyles: Record<StepReviewStatus, string> = {
		hypothesis: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
		confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
		edited: 'bg-sky-500/10 text-sky-400 border-sky-500/20'
	};

	function confidencePct(c: number): number {
		return Math.round(c * 100);
	}

	function touchStep(index: number): void {
		const step = steps[index];
		if (step && step.reviewStatus === 'hypothesis') {
			step.reviewStatus = 'edited';
		}
		markDirty();
	}

	function setReviewStatus(index: number, status: StepReviewStatus): void {
		const step = steps[index];
		if (!step) return;
		step.reviewStatus = status;
		markDirty();
	}

	// ---- String-list helpers (tools / parts / warnings) -------------------
	function addItem(index: number, field: ListField): void {
		steps[index]?.[field].push('');
		touchStep(index);
	}
	function removeItem(index: number, field: ListField, itemIndex: number): void {
		steps[index]?.[field].splice(itemIndex, 1);
		touchStep(index);
	}
	function updateItem(index: number, field: ListField, itemIndex: number, value: string): void {
		const list = steps[index]?.[field];
		if (list) list[itemIndex] = value;
		touchStep(index);
	}

	type ListField = 'tools' | 'warnings';

	// Safe addition to keep lists correct.
	function addPart(index: number): void {
		steps[index]?.parts.push(emptyPartRef());
		touchStep(index);
	}
	function removePart(index: number, partIndex: number): void {
		steps[index]?.parts.splice(partIndex, 1);
		touchStep(index);
	}
	function updatePartLabel(index: number, partIndex: number, value: string): void {
		const part = steps[index]?.parts[partIndex];
		if (part) part.label = value;
		touchStep(index);
	}

	const bomById = $derived(new Map(manual.bom.map((item) => [item.id, item])));
	const openBomPartCount = $derived(
		steps.reduce(
			(count, step) => count + step.parts.filter((part) => partRefHasOpenCandidates(part)).length,
			0
		)
	);

	const bomCandidatesByPart = $derived(
		new Map(
			steps.flatMap((step) =>
				step.parts.map(
					(part) =>
						[
							part,
							(part.candidateBomItemIds ?? [])
								.map((id) => bomById.get(id))
								.filter((item): item is ManualBomItem => item !== undefined)
						] as const
				)
			)
		)
	);

	function chooseBomCandidate(stepIndex: number, partIndex: number, bomItemId: string): void {
		const part = steps[stepIndex]?.parts[partIndex];
		if (!part?.candidateBomItemIds?.includes(bomItemId)) return;
		const item = bomById.get(bomItemId);
		if (!item) return;
		steps[stepIndex].parts[partIndex] = resolvePartRefBomCandidate(part, item);
		touchStep(stepIndex);
	}

	// ---- Alternatives -------------------------------------------------------
	function chooseAlternative(index: number, altIndex: number): void {
		const step = steps[index];
		if (!step) return;
		const chosen = step.alternatives[altIndex];
		if (chosen === undefined) return;
		const previous = step.instruction;
		step.instruction = chosen;
		step.alternatives.splice(altIndex, 1, previous);
		touchStep(index);
	}

	// ---- Split / merge / reorder / remove -----------------------------------
	function splitStep(index: number): void {
		const step = steps[index];
		if (!step) return;
		const mid = Math.round((step.startMs + step.endMs) / 2);
		const second: ManualStep = {
			...structuredClone($state.snapshot(step)),
			id: crypto.randomUUID(),
			order: step.order + 1,
			title: m.editor_step_continued({ title: step.title }),
			instruction: '',
			startMs: mid,
			endMs: step.endMs,
			reviewStatus: 'edited',
			sourceNotes: [],
			alternatives: [],
			critique: [],
			caption: '',
			illustrationUrl: ''
		};
		step.endMs = mid;
		step.reviewStatus = step.reviewStatus === 'hypothesis' ? 'edited' : step.reviewStatus;
		steps.splice(index + 1, 0, second);
		markDirty();
	}

	function mergeWithNext(index: number): void {
		const a = steps[index];
		const b = steps[index + 1];
		if (!a || !b) return;
		a.instruction = [a.instruction, b.instruction].filter(Boolean).join('\n\n');
		a.endMs = Math.max(a.endMs, b.endMs);
		a.tools = dedupe([...a.tools, ...b.tools]);
		a.parts = dedupePartRefs([...a.parts, ...b.parts]);
		a.warnings = dedupe([...a.warnings, ...b.warnings]);
		a.sourceNotes = [...a.sourceNotes, ...b.sourceNotes];
		a.alternatives = [...a.alternatives, ...b.alternatives];
		a.critique = [...a.critique, ...b.critique];
		a.confidence = Math.min(a.confidence, b.confidence);
		a.reviewStatus = 'edited';
		steps.splice(index + 1, 1);
		markDirty();
	}

	function dedupe(items: string[]): string[] {
		return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
	}

	// Dedupe helper for part references.
	function dedupePartRefs(items: PartRef[]): PartRef[] {
		const seen: Record<string, true> = {};
		const out: PartRef[] = [];
		for (const item of items) {
			const label = item.label.trim();
			if (!label) continue;
			const key = `${item.bomItemId ?? ''}:${label}`;
			if (seen[key]) continue;
			seen[key] = true;
			out.push(item);
		}
		return out;
	}

	function moveStep(index: number, delta: number): void {
		const target = index + delta;
		if (target < 0 || target >= steps.length) return;
		const [moved] = steps.splice(index, 1);
		if (moved) steps.splice(target, 0, moved);
		markDirty();
	}

	function removeStep(index: number): void {
		steps.splice(index, 1);
		markDirty();
	}

	function addStep(): void {
		const last = steps[steps.length - 1];
		const start = last ? last.endMs : 0;
		steps.push({
			id: crypto.randomUUID(),
			order: steps.length,
			title: m.editor_default_step_title({ number: steps.length + 1 }),
			instruction: '',
			startMs: start,
			endMs: start,
			keyframeUrl: '',
			tools: [],
			parts: [],
			warnings: [],
			confidence: 0,
			reviewStatus: 'edited',
			sourceNotes: [],
			alternatives: [],
			critique: [],
			caption: '',
			illustrationUrl: ''
		});
		markDirty();
	}

	const payload = $derived(
		JSON.stringify(steps.map((step, index) => ({ ...$state.snapshot(step), order: index })))
	);
</script>

<svelte:head>
	<title>{m.editor_page_title({ title: manual.title })}</title>
</svelte:head>

<div
	class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white relative"
>
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<main class="relative mx-auto max-w-5xl px-6 py-12 lg:py-16 space-y-8">
		<!-- User Profile Nav -->
		<div class="flex justify-end items-center gap-4 relative z-20">
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

		<!-- Header -->
		<header class="space-y-3 relative z-10">
			<div class="flex flex-wrap items-center gap-2">
				<a
					href={resolve('/')}
					class="mr-1 opacity-90 hover:opacity-100 transition-opacity"
					aria-label="Vitruvius home"
				>
					<Logo variant="mark" size={24} />
				</a>
				<a
					href={resolve('/')}
					class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						/>
					</svg>
					{m.editor_all_manuals()}
				</a>
				<span class="text-slate-700">/</span>
				<span
					class="text-xs font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg"
					>{manual.id}</span
				>
			</div>

			<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<h1
					class="text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent"
				>
					{manual.title}
				</h1>

				{#if isReady}
					<a
						href={resolve(`/manuals/${manual.id}/export`)}
						class="self-start md:self-auto inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/10 hover:bg-indigo-500/15 px-4 py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer shadow-lg shadow-indigo-500/5"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						{m.editor_export_manual()}
					</a>
				{/if}
			</div>

			<!-- Version lineage (spec 17): only the head is editable; older versions are
			     read-only snapshots. -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
					{m.editor_version({ version: manual.version })}
				</span>
				{#if readOnly}
					<span
						class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
					>
						{m.editor_readonly_snapshot()}
					</span>
				{/if}
				{#if versions.length > 1}
					<span class="text-slate-700">·</span>
					{#each versions as v (v.id)}
						{@const current = v.id === manual.id}
						<a
							href={resolve(`/manuals/${v.id}`)}
							aria-current={current ? 'page' : undefined}
							class="rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors {current
								? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
								: 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white'}"
						>
							v{v.version}
						</a>
					{/each}
				{/if}
			</div>
		</header>

		{#if !isReady}
			<!-- Status checklist / workflow wait -->
			<section
				class="max-w-md mx-auto rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-md p-8 shadow-xl space-y-6 relative overflow-hidden group"
			>
				<div
					class="absolute -right-16 -top-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500"
				></div>

				<h2
					class="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2"
				>
					<span class="h-2 w-2 rounded-full bg-indigo-400 animate-ping"></span>
					{m.editor_processing_heading()}
				</h2>

				{#if failed}
					<div
						class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-400 flex items-start gap-2.5"
					>
						<svg
							class="w-4 h-4 shrink-0 mt-0.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<div class="min-w-0">
							<p class="font-semibold text-slate-200">{m.editor_failed_title()}</p>
							<p class="text-slate-500 mt-1 leading-relaxed">
								{m.editor_failed_body()}
							</p>
						</div>
					</div>

					<!-- Recover a failed run: retry re-queues a fresh `process` job; delete removes the
					     manual for good. Both server actions are guarded to `failed` status. -->
					<div class="mt-4 flex items-center gap-2">
						<form
							method="POST"
							action="?/retry"
							use:enhance={() => {
								retrying = true;
								return async ({ update }) => {
									try {
										await update({ reset: false });
									} finally {
										retrying = false;
									}
								};
							}}
						>
							<button
								type="submit"
								disabled={retrying || deleting}
								class="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-300 transition-all hover:border-indigo-500/60 hover:bg-indigo-500/15 disabled:pointer-events-none disabled:opacity-40"
							>
								{retrying ? m.editor_retrying() : m.editor_retry()}
							</button>
						</form>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(m.editor_delete_confirm())) {
									cancel();
									return;
								}
								deleting = true;
								return async ({ update }) => {
									try {
										await update();
									} finally {
										deleting = false;
									}
								};
							}}
						>
							<button
								type="submit"
								disabled={retrying || deleting}
								class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 transition-all hover:border-rose-500/60 hover:bg-rose-500/15 disabled:pointer-events-none disabled:opacity-40"
							>
								{m.editor_delete()}
							</button>
						</form>
					</div>

					{#if form?.error}
						<p class="mt-2 text-xs text-rose-400">{form.error}</p>
					{/if}
				{/if}

				<!-- Full pipeline as a checklist: each engine stage is done ✓ / active ⟳ / failed ✗ /
				     upcoming. On failure the row where the run died turns rose; earlier rows stay done.
				     No aria-live here — the list re-renders every 3s poll and would re-announce the whole
				     block; the progress bar below is the small polite live region for stage changes. -->
				<ol class="space-y-4">
					{#each PROCESS_STAGE as stage, i (stage)}
						{@const state = stageState(i)}
						<li class="flex items-center gap-3.5 text-xs">
							<div
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold {state ===
								'done'
									? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
									: state === 'active'
										? 'border-indigo-400 bg-indigo-950/60 text-indigo-300'
										: state === 'failed'
											? 'border-rose-500 bg-rose-500/15 text-rose-400'
											: 'border-slate-800 bg-slate-950 text-slate-600'}"
								aria-label={state === 'active'
									? m.editor_in_progress()
									: state === 'failed'
										? m.status_failed()
										: undefined}
							>
								{#if state === 'done'}
									<svg
										class="h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="3"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{:else if state === 'active'}
									<svg
										class="h-3 w-3 animate-spin"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										aria-hidden="true"
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
									<svg
										class="h-2.5 w-2.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
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
							<span
								class="font-bold uppercase tracking-wider {state === 'active'
									? 'text-white'
									: state === 'done'
										? 'text-slate-300 font-semibold'
										: state === 'failed'
											? 'text-rose-300'
											: 'text-slate-600'}">{stageLabels[stage]()}</span
							>
							{#if state === 'active'}
								<span
									class="text-[9px] px-2 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 font-medium animate-pulse ml-auto"
									>{m.editor_in_progress()}</span
								>
							{:else if state === 'failed'}
								<span
									class="text-[9px] px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-400 font-medium ml-auto"
									>{m.status_failed()}</span
								>
							{/if}
						</li>
					{/each}
				</ol>

				{#if manual.status === 'processing' && progressStage}
					<div class="space-y-2 pt-4" aria-live="polite">
						<div class="flex items-center justify-between text-[11px] font-semibold">
							<span class="text-slate-200">{stageLabels[progressStage]()}</span>
							<span class="text-slate-400 tabular-nums">{stagePct}%</span>
						</div>
						<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
							<div
								class="h-full rounded-full bg-indigo-500 transition-all duration-500"
								style={`width: ${stagePct}%`}
							></div>
						</div>
					</div>
				{/if}

				<p class="text-[11px] text-slate-500 leading-relaxed pt-4 border-t border-slate-900">
					{m.editor_wait_note({ status: m.status_ready() })}
				</p>
			</section>
		{:else}
			{#if readOnly}
				<div
					class="rounded-2xl border border-slate-800 bg-slate-900/30 backdrop-blur-md px-6 py-4 text-xs text-slate-400"
				>
					{m.editor_readonly_banner({ version: manual.version })}
				</div>
			{:else}
				<!-- Enrich (spec 17): attach BOM/CAD that arrived after recording → new version -->
				<form
					method="POST"
					action="?/enrich"
					enctype="multipart/form-data"
					use:enhance={() => {
						enriching = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
							} finally {
								enriching = false;
							}
						};
					}}
					class="mb-6 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-md p-6 transition-all duration-300 hover:border-slate-800/80"
				>
					<details class="group/details">
						<summary
							class="flex cursor-pointer select-none items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 outline-none"
						>
							{m.editor_enrich_summary()}
							<svg
								class="h-3.5 w-3.5 text-slate-500 transition-transform group-open/details:rotate-180"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</summary>
						<p class="mt-3 text-xs leading-relaxed text-slate-500">
							{m.editor_enrich_body({ version: manual.version + 1 })}
						</p>
						<div class="mt-4 grid gap-3 sm:grid-cols-2">
							<label class="block text-xs font-medium text-slate-400">
								{m.editor_enrich_bom_label()}
								<input
									type="file"
									name="bom"
									accept=".csv"
									class="mt-1 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-200"
								/>
							</label>
							<label class="block text-xs font-medium text-slate-400">
								{m.editor_enrich_model_label()}
								<input
									type="file"
									name="model"
									accept=".step,.stp,.obj,.stl"
									class="mt-1 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-200"
								/>
							</label>
						</div>
						<button
							type="submit"
							disabled={enriching}
							class="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/10 transition-all hover:bg-indigo-500 hover:shadow-indigo-600/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
						>
							{enriching
								? m.editor_enrich_creating()
								: m.editor_enrich_submit({ version: manual.version + 1 })}
						</button>
					</details>
				</form>

				<form
					method="POST"
					action="?/regenerate"
					use:enhance={() => {
						regenerating = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
							} finally {
								regenerating = false;
							}
						};
					}}
					class="rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-md p-6 hover:border-slate-800/80 transition-all duration-300 mb-6"
				>
					<details class="group/details">
						<summary
							class="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none outline-none flex items-center justify-between"
						>
							{m.editor_regen_summary()}
							<svg
								class="w-3.5 h-3.5 text-slate-500 transition-transform group-open/details:rotate-180"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</summary>
						<p class="mt-3 text-xs text-slate-500 leading-relaxed">
							{m.editor_regen_body({ status: m.review_edited() })}
						</p>
						<div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
							<select
								name="stepId"
								required
								class="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
							>
								<option value="" disabled selected class="bg-slate-950 text-slate-500"
									>{m.editor_regen_choose_step()}</option
								>
								{#each manual.steps as step, i (step.id)}
									<option value={step.id} class="bg-slate-950 text-slate-200"
										>{i + 1}. {step.title}</option
									>
								{/each}
							</select>
							<select
								name="scope"
								class="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
							>
								{#each regenScopes as scope (scope)}
									<option value={scope} class="bg-slate-950 text-slate-200"
										>{regenScopeLabels[scope]}</option
									>
								{/each}
							</select>
							<button
								type="submit"
								disabled={regenerating}
								class="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none px-4 py-2 text-xs font-bold text-white transition-all shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] cursor-pointer"
							>
								{regenerating ? m.editor_regen_queuing() : m.editor_regen_submit()}
							</button>
						</div>
						<input
							name="prompt"
							required
							placeholder={m.editor_regen_prompt_placeholder()}
							class="mt-3 block w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 transition-all"
						/>
						{#if form?.regenerateQueued}
							<p
								class="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400"
							>
								{m.editor_regen_queued()}
							</p>
						{/if}
					</details>
				</form>
			{/if}

			<!-- Editor Workspace -->
			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ update, result }) => {
						try {
							await update({ reset: false });
							if (result.type === 'success') dirty = false;
						} finally {
							saving = false;
						}
					};
				}}
				class="space-y-6"
			>
				<input type="hidden" name="payload" value={payload} />

				<!-- A disabled fieldset makes the whole editor read-only on a frozen (non-head)
				     version in one native step; the Export links are unaffected (spec 17). -->
				<fieldset disabled={readOnly} class="m-0 min-w-0 space-y-6 border-0 p-0">
					<!-- Sticky Header Toolbar -->
					<div
						class="sticky top-4 z-20 rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between gap-4 shadow-xl"
					>
						<div class="text-xs font-semibold text-slate-400 flex items-center gap-2">
							<span
								class="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-200"
							>
								{m.editor_step_count({ count: steps.length })}
							</span>
							{#if dirty}
								<span class="text-amber-400 flex items-center gap-1.5 animate-pulse">
									<span class="h-2 w-2 rounded-full bg-amber-400"></span>
									{m.editor_unsaved_changes()}
								</span>
							{:else if form?.saved}
								<span class="text-emerald-400 flex items-center gap-1.5">
									<span class="h-2 w-2 rounded-full bg-emerald-400"></span>
									{m.editor_all_saved()}
								</span>
							{/if}
						</div>

						<div class="flex items-center gap-2">
							<a
								href={resolve(`/manuals/${manual.id}/export`)}
								class="rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-all"
							>
								{m.editor_export()}
							</a>
							<button
								type="button"
								onclick={addStep}
								class="rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
							>
								{m.editor_add_step()}
							</button>
							<button
								type="submit"
								disabled={saving || !dirty}
								class="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none px-4 py-2 text-xs font-bold text-white transition-all shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] cursor-pointer"
							>
								{saving ? m.editor_saving() : m.editor_save_changes()}
							</button>
						</div>
					</div>

					{#if form?.error}
						<div
							class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-400 flex items-center gap-2"
						>
							<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<span>{form.error}</span>
						</div>
					{/if}

					{#if openBomPartCount > 0}
						<div
							class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 flex items-start gap-2.5 shadow-lg shadow-amber-500/5"
						>
							<svg
								class="w-4 h-4 shrink-0 mt-0.5 text-amber-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<div>
								<p class="font-bold">{m.editor_bom_required_title()}</p>
								<p class="text-amber-400/80 mt-1 leading-relaxed">
									{m.editor_bom_required_body({ count: openBomPartCount })}
								</p>
							</div>
						</div>
					{/if}

					{#if steps.length === 0}
						<div
							class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 p-16 text-center space-y-3"
						>
							<p class="text-sm font-semibold text-slate-400">{m.editor_no_steps_title()}</p>
							<p class="text-xs text-slate-600">
								{m.editor_no_steps_body()}
							</p>
						</div>
					{/if}

					<!-- Steps List -->
					<ol class="space-y-6">
						{#each steps as step, i (step.id)}
							<li
								class="rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-md p-6 hover:border-slate-800/80 transition-all duration-300 relative overflow-hidden group/step"
							>
								<div
									class="absolute -right-24 -top-24 w-48 h-48 bg-slate-900/5 rounded-full blur-3xl pointer-events-none"
								></div>

								<!-- Step Header -->
								<div
									class="mb-5 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-950"
								>
									<div class="flex items-center gap-3">
										<span
											class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300"
										>
											{i + 1}
										</span>
										<span
											class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border {reviewStyles[
												step.reviewStatus
											]}"
										>
											{reviewLabels[step.reviewStatus]}
										</span>
										<span class="text-xs text-slate-500 font-medium">
											{m.editor_confidence_label()}
											<span
												class={step.confidence < 0.5
													? 'text-amber-400 font-semibold'
													: 'text-indigo-400 font-bold'}>{confidencePct(step.confidence)}%</span
											>
										</span>
									</div>

									<div class="flex items-center gap-1.5">
										<button
											type="button"
											title={m.editor_move_up()}
											onclick={() => moveStep(i, -1)}
											disabled={i === 0}
											class="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
										>
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M5 15l7-7 7 7"
												/>
											</svg>
										</button>
										<button
											type="button"
											title={m.editor_move_down()}
											onclick={() => moveStep(i, 1)}
											disabled={i === steps.length - 1}
											class="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
										>
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</button>
										<span class="h-4 w-px bg-slate-900 mx-1"></span>
										<button
											type="button"
											title={m.editor_remove()}
											onclick={() => removeStep(i)}
											class="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-rose-500 hover:text-white hover:bg-rose-600/95 transition-all cursor-pointer"
										>
											{m.editor_remove()}
										</button>
									</div>
								</div>

								<!-- Step Metadata Bar -->
								<div class="mb-5 space-y-1">
									<div
										class="h-1.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-900"
									>
										<div
											class="h-full rounded-full transition-all duration-300 {step.confidence < 0.5
												? 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-md shadow-amber-500/20'
												: 'bg-gradient-to-r from-indigo-500 to-indigo-400 shadow-md shadow-indigo-500/20'}"
											style="width: {confidencePct(step.confidence)}%"
										></div>
									</div>
								</div>

								<!-- Critic flags, surfaced when present -->
								{#if step.critique.length > 0}
									<div
										class="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5"
									>
										<p
											class="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5"
										>
											<svg
												class="w-3.5 h-3.5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
												/>
											</svg>
											{m.editor_critic_warnings()}
										</p>
										<ul class="list-disc space-y-1 pl-4 text-xs text-amber-300/80 leading-relaxed">
											{#each step.critique as flag, fi (fi)}
												<li>{flag}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Editor Layout Grid -->
								<div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
									<!-- Media and Times (Col 4) -->
									<div class="md:col-span-4 space-y-4">
										{#if step.keyframeUrl}
											<div
												class="rounded-xl overflow-hidden border border-slate-900 bg-slate-950/60 aspect-video relative group/img shadow-md"
											>
												<!-- eslint-disable svelte/no-navigation-without-resolve -->
												<img
													src={step.keyframeUrl}
													alt={m.editor_keyframe_alt()}
													class="w-full h-full object-cover transition-transform group-hover/img:scale-[1.02] duration-500"
												/>
												<!-- eslint-enable svelte/no-navigation-without-resolve -->
												<div
													class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-900 text-[9px] text-slate-400 font-mono"
												>
													{m.editor_keyframe()}
												</div>
											</div>
										{/if}

										<div class="grid grid-cols-2 gap-3.5">
											<label class="block">
												<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
													>{m.editor_start_ms()}</span
												>
												<input
													type="number"
													min="0"
													bind:value={step.startMs}
													oninput={() => touchStep(i)}
													class="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all"
												/>
											</label>
											<label class="block">
												<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
													>{m.editor_end_ms()}</span
												>
												<input
													type="number"
													min="0"
													bind:value={step.endMs}
													oninput={() => touchStep(i)}
													class="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all"
												/>
											</label>
										</div>
									</div>

									<!-- Content Fields (Col 8) -->
									<div class="md:col-span-8 space-y-4">
										<label class="block">
											<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
												>{m.editor_field_title()}</span
											>
											<input
												type="text"
												bind:value={step.title}
												oninput={() => touchStep(i)}
												class="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all"
											/>
										</label>

										<label class="block">
											<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
												>{m.editor_field_instruction()}</span
											>
											<textarea
												bind:value={step.instruction}
												oninput={() => touchStep(i)}
												rows="3"
												placeholder={m.editor_instruction_placeholder()}
												class="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all leading-relaxed"
											></textarea>
										</label>

										<!-- Parts, Tools, Warnings, Alternatives -->
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
											<!-- Components -->
											<div class="rounded-xl border border-slate-900 bg-slate-950/40 p-4 space-y-3">
												<div class="flex items-center justify-between">
													<span
														class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
														>{m.editor_parts_heading()}</span
													>
													<button
														type="button"
														onclick={() => addPart(i)}
														class="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
													>
														{m.editor_add_part()}
													</button>
												</div>
												<div class="space-y-2">
													{#each step.parts as part, pi (pi)}
														<BomPartPicker
															{part}
															partIndex={pi}
															bomCandidates={bomCandidatesByPart.get(part) ?? []}
															onUpdateLabel={(val) => updatePartLabel(i, pi, val)}
															onRemove={() => removePart(i, pi)}
															onChooseCandidate={(bomItemId) =>
																chooseBomCandidate(i, pi, bomItemId)}
														/>
													{/each}
													{#if step.parts.length === 0}
														<p class="text-[11px] text-slate-600 italic">
															{m.editor_no_parts()}
														</p>
													{/if}
												</div>
											</div>

											<!-- Tools -->
											<div class="rounded-xl border border-slate-900 bg-slate-950/40 p-4 space-y-3">
												<div class="flex items-center justify-between">
													<span
														class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
														>{m.editor_tools_heading()}</span
													>
													<button
														type="button"
														onclick={() => addItem(i, 'tools')}
														class="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
													>
														{m.editor_add_tool()}
													</button>
												</div>
												<div class="space-y-1.5">
													{#each step.tools as tool, ti (ti)}
														<div class="flex items-center gap-2">
															<input
																type="text"
																value={tool}
																oninput={(e) => updateItem(i, 'tools', ti, e.currentTarget.value)}
																class="block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
															/>
															<button
																type="button"
																onclick={() => removeItem(i, 'tools', ti)}
																class="text-slate-500 hover:text-rose-400 text-sm px-1.5 transition-colors cursor-pointer"
															>
																×
															</button>
														</div>
													{/each}
													{#if step.tools.length === 0}
														<p class="text-[11px] text-slate-600 italic">
															{m.editor_no_tools()}
														</p>
													{/if}
												</div>
											</div>
										</div>

										<!-- Warnings & Quality Checks -->
										<div class="rounded-xl border border-slate-900 bg-slate-950/40 p-4 space-y-3">
											<div class="flex items-center justify-between">
												<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
													>{m.editor_warnings_heading()}</span
												>
												<button
													type="button"
													onclick={() => addItem(i, 'warnings')}
													class="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
												>
													{m.editor_add_check()}
												</button>
											</div>
											<div class="space-y-1.5">
												{#each step.warnings as warning, wi (wi)}
													<div class="flex items-center gap-2">
														<input
															type="text"
															value={warning}
															oninput={(e) => updateItem(i, 'warnings', wi, e.currentTarget.value)}
															placeholder={m.editor_warning_placeholder()}
															class="block w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-300/90 focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
														/>
														<button
															type="button"
															onclick={() => removeItem(i, 'warnings', wi)}
															class="text-slate-500 hover:text-rose-400 text-sm px-1.5 transition-colors cursor-pointer"
														>
															×
														</button>
													</div>
												{/each}
												{#if step.warnings.length === 0}
													<p class="text-[11px] text-slate-600 italic">
														{m.editor_no_warnings()}
													</p>
												{/if}
											</div>
										</div>

										<!-- Alternatives -->
										{#if step.alternatives.length > 0}
											<div class="rounded-xl border border-slate-900 bg-slate-950/40 p-4 space-y-3">
												<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"
													>{m.editor_alternatives_heading()}</span
												>
												<ul class="space-y-2">
													{#each step.alternatives as alt, ai (ai)}
														<li
															class="flex items-center justify-between gap-3 rounded-lg border border-slate-900 bg-slate-950/60 p-2.5 text-xs text-slate-300"
														>
															<span class="leading-relaxed">{alt}</span>
															<button
																type="button"
																onclick={() => chooseAlternative(i, ai)}
																class="whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
															>
																{m.editor_use_alternative()}
															</button>
														</li>
													{/each}
												</ul>
											</div>
										{/if}

										<!-- Source notes (read-only evidence) -->
										{#if step.sourceNotes.length > 0}
											<details
												class="rounded-xl border border-slate-900 bg-slate-950/20 px-4 py-3 group/details"
											>
												<summary
													class="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none outline-none flex items-center justify-between"
												>
													{m.editor_source_notes({ count: step.sourceNotes.length })}
													<svg
														class="w-3.5 h-3.5 transition-transform group-open/details:rotate-180"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M19 9l-7 7-7-7"
														/>
													</svg>
												</summary>
												<ul
													class="mt-3 list-disc pl-4 text-xs text-slate-400/80 space-y-1.5 leading-relaxed"
												>
													{#each step.sourceNotes as note, ni (ni)}
														<li>{note}</li>
													{/each}
												</ul>
											</details>
										{/if}
									</div>
								</div>

								<!-- Step actions border footer -->
								<div
									class="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-950 pt-4 text-xs"
								>
									<span class="text-slate-500 font-medium">{m.editor_verify_step()}</span>
									{#each STEP_REVIEW_STATUS as status (status)}
										<button
											type="button"
											onclick={() => setReviewStatus(i, status)}
											class="rounded-lg px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer {step.reviewStatus ===
											status
												? reviewStyles[status]
												: 'text-slate-400 border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:text-white'}"
										>
											{reviewLabels[status]}
										</button>
									{/each}

									<span class="mx-2 h-4 w-px bg-slate-900"></span>

									<button
										type="button"
										onclick={() => splitStep(i)}
										class="rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
									>
										{m.editor_split_step()}
									</button>
									<button
										type="button"
										onclick={() => mergeWithNext(i)}
										disabled={i === steps.length - 1}
										class="rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
									>
										{m.editor_merge_next()}
									</button>
								</div>
							</li>
						{/each}
					</ol>
				</fieldset>
			</form>
		{/if}
	</main>
</div>
