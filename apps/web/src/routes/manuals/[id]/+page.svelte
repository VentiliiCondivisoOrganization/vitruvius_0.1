<script lang="ts">
	import { resolve } from '$app/paths';
	import { MANUAL_STATUS, type ManualStatus } from '@vitruvius/core';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const manual = $derived(data.manual);

	// Derive the happy-path pipeline from the contract so it can't drift; `failed`
	// is a terminal state shown on its own, not a stage. Steps below the current
	// status are done; the current one is in progress.
	const stages: readonly ManualStatus[] = MANUAL_STATUS.filter((s) => s !== 'failed');
	const failed = $derived(manual.status === 'failed');
	const currentIndex = $derived(stages.indexOf(manual.status));
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
	<header class="space-y-2">
		<a href={resolve('/')} class="text-sm text-slate-500 hover:text-slate-700">← Upload another</a>
		<h1 class="text-3xl font-bold tracking-tight text-slate-900">{manual.title}</h1>
		<p class="text-sm text-slate-500">Manual <span class="font-mono">{manual.id}</span></p>
	</header>

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
	</section>

	<footer class="text-sm text-slate-400">
		The editor opens here once processing reports <span class="font-mono">ready</span> (spec 08).
	</footer>
</main>
