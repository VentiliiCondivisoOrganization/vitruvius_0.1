<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);

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
			Upload a video of an assembly process. Optionally attach a BOM CSV and/or a digital model for
			structured part mapping (spec 13).
		</p>
	</header>

	<section class="space-y-4">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Upload a video</h2>
		<form
			method="POST"
			enctype="multipart/form-data"
			class="space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						// Always re-enable the button, even if the submission rejects.
						submitting = false;
					}
				};
			}}
		>
			<label for="video" class="block text-sm font-medium text-slate-700">Video file</label>
			<input
				id="video"
				type="file"
				name="video"
				accept="video/*"
				required
				class="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-slate-100"
			/>

			<label for="bom" class="block text-sm font-medium text-slate-700">
				BOM file <span class="font-normal text-slate-400">(optional CSV)</span>
			</label>
			<input
				id="bom"
				type="file"
				name="bom"
				accept=".csv,text/csv"
				class="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-100"
			/>

			<label for="model" class="block text-sm font-medium text-slate-700">
				Digital model <span class="font-normal text-slate-400">(optional STEP/OBJ/STL)</span>
			</label>
			<input
				id="model"
				type="file"
				name="model"
				accept=".step,.stp,.obj,.stl"
				class="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-100"
			/>
			<button
				type="submit"
				disabled={submitting}
				class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 disabled:opacity-50"
			>
				{submitting ? 'Uploading…' : 'Upload and queue'}
			</button>
			{#if form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}
		</form>
	</section>

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

	<footer class="text-sm text-slate-400">
		Upload + queue is live (spec 03). Processing, editor and export arrive in specs 04–09.
	</footer>
</main>
