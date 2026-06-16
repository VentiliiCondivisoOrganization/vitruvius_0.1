<script lang="ts">
	import { MANUAL_STATUS } from '@vitruvius/core';

	// The contract is the source of truth even for the placeholder UI.
	const pipeline = [
		'Upload video',
		'Segment into steps',
		'Extract keyframes',
		'Generate draft instructions',
		'Human revision editor',
		'Export PDF / HTML'
	];
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
	<header class="space-y-3">
		<p class="text-sm font-medium uppercase tracking-widest text-slate-500">Vitruvius</p>
		<h1 class="text-4xl font-bold tracking-tight text-slate-900">
			AI-drafted assembly manuals, finished by a human.
		</h1>
		<p class="text-lg text-slate-600">
			Turn a video of an assembly process into an editable, step-by-step instruction manual. Every
			AI output carries a confidence value and source notes — a human confirms and corrects before
			export. Not a fully automatic generator.
		</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Pipeline</h2>
		<ol class="flex flex-wrap gap-2 text-sm">
			{#each pipeline as step, i (step)}
				<li class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
					<span class="font-mono text-slate-400">{i + 1}.</span>
					{step}
				</li>
			{/each}
		</ol>
	</section>

	<section class="space-y-2">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Manual statuses</h2>
		<div class="flex flex-wrap gap-2 font-mono text-xs">
			{#each MANUAL_STATUS as status (status)}
				<span class="rounded bg-slate-900 px-2 py-1 text-slate-100">{status}</span>
			{/each}
		</div>
	</section>

	<footer class="text-sm text-slate-400">
		Bootstrap foundation only — upload, processing, editor and export arrive in specs 03–09.
	</footer>
</main>
