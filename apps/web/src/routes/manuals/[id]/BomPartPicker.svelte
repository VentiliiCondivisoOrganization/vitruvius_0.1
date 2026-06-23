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
	class="space-y-2 rounded-lg border p-2 transition-all {partRefHasOpenCandidates(part)
		? 'border-amber-500/20 bg-amber-500/5'
		: 'border-transparent'}"
>
	<div class="flex items-center gap-2">
		<input
			type="text"
			value={part.label}
			oninput={(e) => onUpdateLabel(e.currentTarget.value)}
			class="block w-full rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700"
		/>
		{#if part.bomItemId}
			<span
				class="shrink-0 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400"
				title="Resolved BOM row"
			>
				{formatPartRef(part)}
			</span>
		{/if}
		<button
			type="button"
			onclick={onRemove}
			aria-label="Remove part {part.label || partIndex + 1}"
			class="text-slate-500 hover:text-rose-400 text-sm px-1.5 transition-colors cursor-pointer"
		>
			×
		</button>
	</div>
	{#if partRefHasOpenCandidates(part)}
		<div class="space-y-1">
			<p class="text-[10px] font-bold uppercase tracking-wider text-amber-400">
				Which BOM row matches this step?
			</p>
			<ul class="space-y-1.5">
				{#each bomCandidates as candidate (candidate.id)}
					<li class="flex items-center gap-2">
						<span
							class="block w-full rounded-lg bg-slate-950 border border-slate-900 px-2.5 py-1.5 text-[11px] text-slate-350"
						>
							{formatManualBomItem(candidate)}
							{#if candidate.description.trim()}
								<span class="text-slate-500"> — {candidate.description.trim()}</span>
							{/if}
						</span>
						<button
							type="button"
							onclick={() => onChooseCandidate(candidate.id)}
							class="whitespace-nowrap rounded-lg border border-amber-500/30 bg-amber-50/10 hover:bg-amber-50/20 px-2.5 py-1 text-[10px] font-bold text-amber-300 hover:text-white transition-all cursor-pointer"
						>
							Use this
						</button>
					</li>
				{:else}
					<li class="text-[11px] text-amber-400/70 italic">
						BOM candidates are no longer in this manual — edit the label or re-upload.
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
