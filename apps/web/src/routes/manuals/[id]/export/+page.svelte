<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const manual = $derived(data.manual);
	const ready = $derived(manual.status === 'ready');
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
	<header class="space-y-2">
		<a href={resolve(`/manuals/${manual.id}`)} class="text-sm text-slate-500 hover:text-slate-700">
			← Back to manual
		</a>
		<h1 class="text-3xl font-bold tracking-tight text-slate-900">Export — {manual.title}</h1>
	</header>

	{#if !ready}
		<p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
			This manual is <span class="font-mono">{manual.status}</span>. Export becomes available once
			it is <span class="font-mono">ready</span>.
		</p>
	{:else}
		<section class="space-y-4">
			<a
				href={resolve(`/manuals/${manual.id}/export/view`)}
				class="inline-block text-sm font-medium text-slate-700 underline hover:text-slate-900"
			>
				View HTML rendering →
			</a>

			<form method="POST" use:enhance class="space-y-2">
				<button
					type="submit"
					class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Generate PDF
				</button>
				{#if form?.queued}
					<p class="text-sm text-green-700">
						Export queued. Reload in a moment to download the PDF.
					</p>
				{:else if form?.error}
					<p class="text-sm text-red-700">{form.error}</p>
				{/if}
			</form>

			{#if data.downloadUrl}
				<!-- External, short-lived Supabase signed URL — not an app route, so resolve() does not apply. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={data.downloadUrl}
					download={`${manual.title}.pdf`}
					class="inline-block rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
				>
					Download PDF
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<p class="text-sm text-slate-400">No PDF yet — generate one above.</p>
			{/if}
		</section>
	{/if}
</main>
