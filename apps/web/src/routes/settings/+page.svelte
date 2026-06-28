<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import UserNav from '$lib/components/UserNav.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);

	const identities = $derived(data.user.identities ?? []);
	const googleIdentity = $derived(identities.find((id) => id.provider === 'google'));
	const hasGoogle = $derived(!!googleIdentity);
</script>

<svelte:head>
	<title>{m.settings_page_title()}</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white">
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<main class="relative mx-auto max-w-4xl px-6 py-16 lg:py-24 space-y-8">
		<!-- Header Navigation -->
		<div class="flex justify-between items-center">
			<a
				href={resolve('/')}
				class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition font-semibold"
			>
				{m.settings_back_to_dashboard()}
			</a>
			<UserNav session={data.session} compact />
		</div>

		<!-- Page Header -->
		<header class="space-y-2">
			<h1
				class="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent"
			>
				{m.settings_heading()}
			</h1>
			<p class="text-sm text-slate-400">
				{data.user.email}
			</p>
		</header>

		<!-- Notifications & Statuses -->
		{#if form?.error}
			<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div
				class="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
			>
				{form.message ?? m.settings_success_connected()}
			</div>
		{/if}

		<!-- Settings Grid -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
			<!-- Info / Description Column -->
			<div class="space-y-2">
				<h2 class="text-lg font-bold text-white">
					{m.settings_connected_methods()}
				</h2>
				<p class="text-xs text-slate-400 leading-relaxed">
					{m.settings_connected_methods_desc()}
				</p>
			</div>

			<!-- Form/Controls Column -->
			<div class="md:col-span-2 space-y-6">
				<!-- Password / Email Card -->
				<section
					class="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 shadow-lg space-y-4"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-center gap-3">
							<div class="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
								<svg
									class="h-5 w-5 text-slate-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
							</div>
							<div>
								<h3 class="text-sm font-semibold text-white">
									{m.auth_method_password()} / {m.auth_method_magic_link()}
								</h3>
								<p class="text-xs text-slate-400 mt-1">
									{m.settings_password_connected()}
								</p>
							</div>
						</div>
						<a
							href={resolve('/reset-password')}
							class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white hover:border-slate-700 transition font-semibold"
						>
							{m.auth_set_new_password()}
						</a>
					</div>
				</section>

				<!-- Google OAuth Card -->
				<section
					class="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 shadow-lg space-y-4"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-center gap-3">
							<div class="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
								<svg
									class="h-5 w-5 shrink-0"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path
										d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
										fill="#4285F4"
									/>
									<path
										d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
										fill="#34A853"
									/>
									<path
										d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
										fill="#FBBC05"
									/>
									<path
										d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
										fill="#EA4335"
									/>
								</svg>
							</div>
							<div>
								<h3 class="text-sm font-semibold text-white">{m.auth_google_oauth()}</h3>
								<p class="text-xs mt-1 {hasGoogle ? 'text-emerald-400' : 'text-slate-400'}">
									{hasGoogle ? m.settings_google_connected() : m.settings_google_not_connected()}
								</p>
							</div>
						</div>

						{#if hasGoogle}
							<form
								method="POST"
								action="?/disconnectGoogle"
								use:enhance={() => {
									submitting = true;
									return async ({ update }) => {
										submitting = false;
										await update();
									};
								}}
							>
								<button
									type="submit"
									disabled={submitting}
									class="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-semibold cursor-pointer disabled:opacity-50"
								>
									{m.settings_disconnect_google()}
								</button>
							</form>
						{:else}
							<form
								method="POST"
								action="?/connectGoogle"
								use:enhance={() => {
									submitting = true;
									return async ({ update }) => {
										submitting = false;
										await update();
									};
								}}
							>
								<button
									type="submit"
									disabled={submitting}
									class="text-xs px-3 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition font-semibold cursor-pointer disabled:opacity-50"
								>
									{m.settings_connect_google()}
								</button>
							</form>
						{/if}
					</div>
				</section>
			</div>
		</div>
	</main>
</div>
