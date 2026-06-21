<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		MANUAL_STATUS,
		STEP_REVIEW_STATUS,
		emptyPartRef,
		formatManualBomItem,
		formatPartRef,
		partRefHasOpenCandidates,
		resolvePartRefBomCandidate,
		type ManualBomItem,
		type ManualStatus,
		type ManualStep,
		type PartRef,
		type StepReviewStatus
	} from '@vitruvius/core';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const manual = $derived(data.manual);
	const isReady = $derived(manual.status === 'ready');

	// ---- Status view (non-ready manuals) -----------------------------------
	// Derive the happy-path pipeline from the contract so it can't drift; `failed`
	// is a terminal state shown on its own, not a stage.
	const stages: readonly ManualStatus[] = MANUAL_STATUS.filter((s) => s !== 'failed');
	const failed = $derived(manual.status === 'failed');
	const currentIndex = $derived(stages.indexOf(manual.status));

	// ---- Editor view (ready manuals) ---------------------------------------
	// A local, editable copy of the steps. Seeded from server data; persisted via
	// the `save` form action. `structuredClone` keeps the original `data` immutable
	// so a failed save leaves the page coherent.
	let steps = $state<ManualStep[]>([]);
	let dirty = $state(false);
	let saving = $state(false);
	// The manual id the local `steps` were seeded from. SvelteKit can reuse this
	// component instance across `/manuals/[id]` navigations, so we must detect an id
	// change and re-seed even if the previous manual had unsaved edits — otherwise the
	// new manual's header would show (and could submit) the old manual's steps.
	let seededId = $state<string | null>(null);
	$effect(() => {
		const m = manual;
		if (m.id !== seededId) {
			// New manual (navigation): always reset, discarding any stale edit state.
			steps = structuredClone($state.snapshot(m.steps)) as ManualStep[];
			seededId = m.id;
			dirty = false;
			return;
		}
		// Same manual: re-seed after a successful save re-runs the load, but never
		// clobber an in-progress edit.
		if (!dirty && !saving) {
			steps = structuredClone($state.snapshot(m.steps)) as ManualStep[];
		}
	});

	function markDirty(): void {
		dirty = true;
	}

	const reviewLabels: Record<StepReviewStatus, string> = {
		hypothesis: 'Hypothesis',
		confirmed: 'Confirmed',
		edited: 'Edited'
	};
	const reviewStyles: Record<StepReviewStatus, string> = {
		hypothesis: 'bg-amber-50 text-amber-700 ring-amber-200',
		confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
		edited: 'bg-sky-50 text-sky-700 ring-sky-200'
	};

	function confidencePct(c: number): number {
		return Math.round(c * 100);
	}

	// A field-level edit always demotes a step to `edited` (unless the user has
	// explicitly confirmed it via the Confirm button). This is the spec's signal
	// that human work happened.
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

	// ---- String-list helpers (tools / parts / warnings / quality checks) ----
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

	function bomCandidatesForPart(part: PartRef): ManualBomItem[] {
		return (part.candidateBomItemIds ?? [])
			.map((id) => bomById.get(id))
			.filter((item): item is ManualBomItem => item !== undefined);
	}

	function chooseBomCandidate(stepIndex: number, partIndex: number, bomItemId: string): void {
		const part = steps[stepIndex]?.parts[partIndex];
		if (!part?.candidateBomItemIds?.includes(bomItemId)) return;
		const item = bomById.get(bomItemId);
		if (!item) return;
		steps[stepIndex].parts[partIndex] = resolvePartRefBomCandidate(part, item);
		touchStep(stepIndex);
	}

	// ---- Alternatives -------------------------------------------------------
	// Choosing an alternative promotes it to the instruction and keeps the former
	// instruction in the alternatives list, so nothing is lost and the choice is
	// reversible.
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
		// The second half starts where the first ends and reuses the keyframe; the
		// editor fills in the detail. A fresh id keeps it a distinct row.
		const second: ManualStep = {
			...structuredClone($state.snapshot(step)),
			id: crypto.randomUUID(),
			order: step.order + 1,
			title: `${step.title} (cont.)`,
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
			title: `Step ${steps.length + 1}`,
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

	// The hidden payload submitted to the `save` action. Re-numbered server-side
	// too, but kept tidy here so the round-trip is obvious.
	const payload = $derived(
		JSON.stringify(steps.map((step, index) => ({ ...$state.snapshot(step), order: index })))
	);
</script>

<main class="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
	<header class="space-y-2">
		<a href={resolve('/')} class="text-sm text-slate-500 hover:text-slate-700">← Upload another</a>
		<h1 class="text-3xl font-bold tracking-tight text-slate-900">{manual.title}</h1>
		<p class="text-sm text-slate-500">Manual <span class="font-mono">{manual.id}</span></p>
	</header>

	{#if !isReady}
		<section class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Status</h2>
			{#if failed}
				<p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
					Processing failed. Try uploading the video again.
				</p>
			{:else}
				<ol class="space-y-2">
					{#each stages as stage, i (stage)}
						<li class="flex items-center gap-2 text-sm">
							<span
								class="inline-block h-2 w-2 rounded-full {i <= currentIndex
									? 'bg-slate-900'
									: 'bg-slate-300'}"
							></span>
							<span class={i <= currentIndex ? 'text-slate-900' : 'text-slate-400'}>{stage}</span>
							{#if i === currentIndex && stage !== 'ready'}
								<span class="text-slate-400">— in progress</span>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
			<p class="text-sm text-slate-400">
				The guided editor opens here once processing reports
				<span class="font-mono">ready</span>.
			</p>
		</section>
	{:else}
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
		>
			<input type="hidden" name="payload" value={payload} />

			<div
				class="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur"
			>
				<div class="text-sm text-slate-600">
					{steps.length}
					{steps.length === 1 ? 'step' : 'steps'}
					{#if dirty}
						<span class="ml-2 text-amber-600">• unsaved changes</span>
					{:else if form?.saved}
						<span class="ml-2 text-emerald-600">• saved</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<a
						href={resolve(`/manuals/${manual.id}/export`)}
						class="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Export
					</a>
					<button
						type="button"
						onclick={addStep}
						class="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						+ Add step
					</button>
					<button
						type="submit"
						disabled={saving || !dirty}
						class="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-slate-100 disabled:opacity-50"
					>
						{saving ? 'Saving…' : 'Save changes'}
					</button>
				</div>
			</div>

			{#if form?.error}
				<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{form.error}</p>
			{/if}

			{#if openBomPartCount > 0}
				<p
					class="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
				>
					{openBomPartCount} component{openBomPartCount === 1 ? '' : 's'} need a BOM choice before export.
					Pick one option per highlighted part below, then save.
				</p>
			{/if}

			{#if steps.length === 0}
				<p
					class="rounded border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500"
				>
					This manual has no steps yet. Add one to start building it.
				</p>
			{/if}

			<ol class="space-y-6">
				{#each steps as step, i (step.id)}
					<li class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div class="mb-3 flex items-start justify-between gap-3">
							<div class="flex items-center gap-2">
								<span
									class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-slate-100"
								>
									{i + 1}
								</span>
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset {reviewStyles[
										step.reviewStatus
									]}"
								>
									{reviewLabels[step.reviewStatus]}
								</span>
								<span class="text-xs text-slate-500">
									confidence {confidencePct(step.confidence)}%
								</span>
							</div>
							<div class="flex items-center gap-1">
								<button
									type="button"
									title="Move up"
									onclick={() => moveStep(i, -1)}
									disabled={i === 0}
									class="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
								>
									↑
								</button>
								<button
									type="button"
									title="Move down"
									onclick={() => moveStep(i, 1)}
									disabled={i === steps.length - 1}
									class="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
								>
									↓
								</button>
								<button
									type="button"
									title="Remove step"
									onclick={() => removeStep(i)}
									class="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
								>
									Remove
								</button>
							</div>
						</div>

						<!-- Confidence bar -->
						<div class="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
							<div
								class="h-full rounded-full {step.confidence < 0.5
									? 'bg-amber-400'
									: 'bg-emerald-400'}"
								style="width: {confidencePct(step.confidence)}%"
							></div>
						</div>

						<!-- Critic flags (spec 10), surfaced when present -->
						{#if step.critique.length > 0}
							<div class="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2">
								<p class="text-xs font-semibold uppercase tracking-wide text-amber-700">
									Critic flags
								</p>
								<ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm text-amber-800">
									{#each step.critique as flag, fi (fi)}
										<li>{flag}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<div class="grid gap-4">
							<label class="block">
								<span class="text-xs font-medium uppercase tracking-wide text-slate-500">Title</span
								>
								<input
									type="text"
									bind:value={step.title}
									oninput={() => touchStep(i)}
									class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
								/>
							</label>

							<label class="block">
								<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
									Instruction
								</span>
								<textarea
									bind:value={step.instruction}
									oninput={() => touchStep(i)}
									rows="3"
									placeholder="Describe what to do in this step. Note any missing info here."
									class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
								></textarea>
							</label>

							<div class="grid grid-cols-2 gap-4">
								<label class="block">
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
										Start (ms)
									</span>
									<input
										type="number"
										min="0"
										bind:value={step.startMs}
										oninput={() => touchStep(i)}
										class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
									/>
								</label>
								<label class="block">
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
										End (ms)
									</span>
									<input
										type="number"
										min="0"
										bind:value={step.endMs}
										oninput={() => touchStep(i)}
										class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
									/>
								</label>
							</div>

							<!-- Components / parts -->
							<div>
								<div class="flex items-center justify-between">
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
										Components / parts
									</span>
									<button
										type="button"
										onclick={() => addPart(i)}
										class="text-xs text-slate-500 hover:text-slate-800"
									>
										+ Add
									</button>
								</div>
								<div class="mt-1 space-y-3">
									{#each step.parts as part, pi (pi)}
										<div
											class="space-y-1.5 rounded border px-2 py-2 {partRefHasOpenCandidates(part)
												? 'border-amber-300 bg-amber-50/40'
												: 'border-transparent'}"
										>
											<div class="flex items-center gap-2">
												<input
													type="text"
													value={part.label}
													oninput={(e) => updatePartLabel(i, pi, e.currentTarget.value)}
													class="block w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
												/>
												{#if part.bomItemId}
													<span
														class="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
														title="Resolved BOM row"
													>
														{formatPartRef(part)}
													</span>
												{/if}
												<button
													type="button"
													onclick={() => removePart(i, pi)}
													class="text-xs text-red-500 hover:text-red-700">×</button
												>
											</div>
											{#if partRefHasOpenCandidates(part)}
												<div>
													<p class="text-xs font-medium text-amber-800">
														Which BOM row matches this step?
													</p>
													<ul class="mt-1 space-y-1.5">
														{#each bomCandidatesForPart(part) as candidate (candidate.id)}
															<li class="flex items-center gap-2">
																<span
																	class="block w-full rounded bg-white px-2 py-1 text-sm text-slate-700 ring-1 ring-amber-200"
																>
																	{formatManualBomItem(candidate)}
																	{#if candidate.description.trim()}
																		<span class="text-slate-500">
																			— {candidate.description.trim()}</span
																		>
																	{/if}
																</span>
																<button
																	type="button"
																	onclick={() => chooseBomCandidate(i, pi, candidate.id)}
																	class="whitespace-nowrap rounded border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
																>
																	Use this
																</button>
															</li>
														{:else}
															<li class="text-xs text-amber-700">
																BOM candidates are no longer in this manual — edit the label or
																re-upload.
															</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
									{/each}
									{#if step.parts.length === 0}
										<p class="text-xs text-slate-400">No parts listed.</p>
									{/if}
								</div>
							</div>

							<!-- Tools -->
							<div>
								<div class="flex items-center justify-between">
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500"
										>Tools</span
									>
									<button
										type="button"
										onclick={() => addItem(i, 'tools')}
										class="text-xs text-slate-500 hover:text-slate-800"
									>
										+ Add
									</button>
								</div>
								<div class="mt-1 space-y-1.5">
									{#each step.tools as tool, ti (ti)}
										<div class="flex items-center gap-2">
											<input
												type="text"
												value={tool}
												oninput={(e) => updateItem(i, 'tools', ti, e.currentTarget.value)}
												class="block w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
											/>
											<button
												type="button"
												onclick={() => removeItem(i, 'tools', ti)}
												class="text-xs text-red-500 hover:text-red-700">×</button
											>
										</div>
									{/each}
									{#if step.tools.length === 0}
										<p class="text-xs text-slate-400">No tools listed.</p>
									{/if}
								</div>
							</div>

							<!-- Warnings / quality checks -->
							<div>
								<div class="flex items-center justify-between">
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
										Warnings &amp; quality checks
									</span>
									<button
										type="button"
										onclick={() => addItem(i, 'warnings')}
										class="text-xs text-slate-500 hover:text-slate-800"
									>
										+ Add
									</button>
								</div>
								<div class="mt-1 space-y-1.5">
									{#each step.warnings as warning, wi (wi)}
										<div class="flex items-center gap-2">
											<input
												type="text"
												value={warning}
												oninput={(e) => updateItem(i, 'warnings', wi, e.currentTarget.value)}
												placeholder="e.g. Wear gloves / Check the panel is flush"
												class="block w-full rounded border border-amber-300 bg-amber-50/40 px-2 py-1 text-sm text-slate-900"
											/>
											<button
												type="button"
												onclick={() => removeItem(i, 'warnings', wi)}
												class="text-xs text-red-500 hover:text-red-700">×</button
											>
										</div>
									{/each}
									{#if step.warnings.length === 0}
										<p class="text-xs text-slate-400">No warnings or checks.</p>
									{/if}
								</div>
							</div>

							<!-- Alternatives -->
							{#if step.alternatives.length > 0}
								<div>
									<span class="text-xs font-medium uppercase tracking-wide text-slate-500">
										Alternatives
									</span>
									<ul class="mt-1 space-y-1.5">
										{#each step.alternatives as alt, ai (ai)}
											<li class="flex items-center gap-2">
												<span
													class="block w-full rounded bg-slate-50 px-2 py-1 text-sm text-slate-700"
												>
													{alt}
												</span>
												<button
													type="button"
													onclick={() => chooseAlternative(i, ai)}
													class="whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
												>
													Use this
												</button>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<!-- Source notes (read-only evidence) -->
							{#if step.sourceNotes.length > 0}
								<details class="rounded border border-slate-200 bg-slate-50 px-3 py-2">
									<summary
										class="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500"
									>
										Source notes ({step.sourceNotes.length})
									</summary>
									<ul class="mt-2 list-disc space-y-0.5 pl-4 text-sm text-slate-600">
										{#each step.sourceNotes as note, ni (ni)}
											<li>{note}</li>
										{/each}
									</ul>
								</details>
							{/if}
						</div>

						<!-- Step-level actions: review status + split/merge -->
						<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
							<span class="text-xs text-slate-400">Mark as:</span>
							{#each STEP_REVIEW_STATUS as status (status)}
								<button
									type="button"
									onclick={() => setReviewStatus(i, status)}
									class="rounded px-2 py-1 text-xs font-medium ring-1 ring-inset {step.reviewStatus ===
									status
										? reviewStyles[status]
										: 'text-slate-500 ring-slate-200 hover:bg-slate-50'}"
								>
									{reviewLabels[status]}
								</button>
							{/each}
							<span class="mx-1 h-4 w-px bg-slate-200"></span>
							<button
								type="button"
								onclick={() => splitStep(i)}
								class="rounded px-2 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
							>
								Split
							</button>
							<button
								type="button"
								onclick={() => mergeWithNext(i)}
								disabled={i === steps.length - 1}
								class="rounded px-2 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-30"
							>
								Merge with next
							</button>
						</div>
					</li>
				{/each}
			</ol>
		</form>
	{/if}
</main>
