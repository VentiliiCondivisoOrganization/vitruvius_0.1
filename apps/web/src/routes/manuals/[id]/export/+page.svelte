<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const manual = $derived(data.manual);
	const ready = $derived(manual.status === 'ready');

	const statusLabels: Record<string, () => string> = {
		uploaded: m.status_uploaded,
		processing: m.status_processing,
		ready: m.status_ready,
		failed: m.status_failed
	};
	const statusLabel = $derived(statusLabels[manual.status]?.() ?? manual.status);
</script>

<svelte:head>
	<title>{m.export_page_title({ title: manual.title })}</title>
</svelte:head>

<div
	class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white relative flex flex-col justify-center"
>
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<main class="relative mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-16 z-10">
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
				<form action="/logout" method="POST" use:enhance>
					<button
						type="submit"
						class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer font-semibold"
					>
						{m.nav_log_out()}
					</button>
				</form>
			{/if}
		</div>

		<header class="space-y-3">
			<a
				href={resolve(`/manuals/${manual.id}`)}
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
				{m.export_back_to_manual()}
			</a>
			<h1
				class="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent"
			>
				{m.export_heading()}
			</h1>
			<p class="text-xs text-slate-500 font-semibold">{manual.title}</p>
		</header>

		{#if !ready}
			<div
				class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 flex items-start gap-2.5"
			>
				<svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div>
					<p class="font-bold">{m.export_not_ready_title()}</p>
					<p class="text-amber-400/80 mt-1 leading-relaxed">
						{m.export_not_ready_body({ status: statusLabel, readyStatus: m.status_ready() })}
					</p>
				</div>
			</div>
		{:else}
			<section
				class="rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-md p-6 sm:p-8 shadow-xl space-y-6 relative overflow-hidden group"
			>
				<div
					class="absolute -right-16 -top-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500 pointer-events-none"
				></div>

				<div class="flex items-center justify-between pb-4 border-b border-slate-950">
					<span class="text-xs font-bold uppercase tracking-wider text-slate-400"
						>{m.export_format_options()}</span
					>
					<a
						href={resolve(`/manuals/${manual.id}/export/view`)}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
					>
						{m.export_html_preview()}
						<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				</div>

				{#if data.exportBlockedReason}
					<div
						class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 flex items-start gap-2.5"
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
						<div>
							<p class="font-bold">{m.export_blocked_title()}</p>
							<p class="text-amber-400/80 mt-1 leading-relaxed">{data.exportBlockedReason}</p>
						</div>
					</div>
				{/if}

				<form method="POST" use:enhance class="space-y-3">
					<button
						type="submit"
						disabled={Boolean(data.exportBlockedReason)}
						class="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs py-3 px-4 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
							/>
						</svg>
						{m.export_generate_pdf()}
					</button>

					{#if form?.queued}
						<p class="text-xs text-emerald-400 font-bold text-center animate-pulse pt-2">
							{m.export_queued()}
						</p>
					{:else if form?.error}
						<p class="text-xs text-rose-400 font-bold text-center pt-2">{form.error}</p>
					{/if}
				</form>

				{#if data.downloadUrl}
					<div class="border-t border-slate-950 pt-6 text-center space-y-3">
						<p class="text-[11px] text-slate-500 font-medium">
							{m.export_compiled_success()}
						</p>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={data.downloadUrl}
							download={`${manual.title}.pdf`}
							class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 px-4 py-3 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer shadow-md"
						>
							<svg
								class="w-4 h-4 text-emerald-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							{m.export_download_pdf()}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
				{:else}
					<div class="border-t border-slate-950 pt-6 text-center">
						<p class="text-[11px] text-slate-500 italic">
							{m.export_no_pdf_yet()}
						</p>
					</div>
				{/if}
			</section>
		{/if}
	</main>
</div>
