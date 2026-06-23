<script lang="ts">
	import {
		formatManualBomItem,
		formatPartRef,
		partRefHasOpenCandidates,
		type ManualBomItem,
		type PartRef
	} from '@vitruvius/core';

	let {
		part,
		partIndex,
		bomCandidates,
		onUpdateLabel,
		onRemove,
		onChooseCandidate
	}: {
		part: PartRef;
		partIndex: number;
		bomCandidates: ManualBomItem[];
		onUpdateLabel: (value: string) => void;
		onRemove: () => void;
		onChooseCandidate: (bomItemId: string) => void;
	} = $props();
</script>

<div
	class="space-y-1.5 rounded border px-2 py-2 {partRefHasOpenCandidates(part)
		? 'border-amber-300 bg-amber-50/40'
		: 'border-transparent'}"
>
	<div class="flex items-center gap-2">
		<input
			type="text"
			value={part.label}
			oninput={(e) => onUpdateLabel(e.currentTarget.value)}
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
			onclick={onRemove}
			aria-label="Remove part {part.label || partIndex + 1}"
			class="text-xs text-red-500 hover:text-red-700">×</button
		>
	</div>
	{#if partRefHasOpenCandidates(part)}
		<div>
			<p class="text-xs font-medium text-amber-800">Which BOM row matches this step?</p>
			<ul class="mt-1 space-y-1.5">
				{#each bomCandidates as candidate (candidate.id)}
					<li class="flex items-center gap-2">
						<span
							class="block w-full rounded bg-white px-2 py-1 text-sm text-slate-700 ring-1 ring-amber-200"
						>
							{formatManualBomItem(candidate)}
							{#if candidate.description.trim()}
								<span class="text-slate-500"> — {candidate.description.trim()}</span>
							{/if}
						</span>
						<button
							type="button"
							onclick={() => onChooseCandidate(candidate.id)}
							class="whitespace-nowrap rounded border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
						>
							Use this
						</button>
					</li>
				{:else}
					<li class="text-xs text-amber-700">
						BOM candidates are no longer in this manual — edit the label or re-upload.
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
