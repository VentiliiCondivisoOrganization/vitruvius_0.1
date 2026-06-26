<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
	let activeTab = $state('password'); // 'password' or 'magiclink'
</script>

<svelte:head>
	<title>{m.auth_login_page_title()}</title>
</svelte:head>

<div
	class="min-h-screen bg-slate-950 text-slate-100 selection:bg-slate-800 selection:text-white relative flex flex-col justify-center py-12 sm:px-6 lg:px-8"
>
	<!-- Decorative grid background -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"
	></div>

	<div class="relative sm:mx-auto sm:w-full sm:max-w-md space-y-6">
		<div class="flex justify-end">
			<LanguageSwitcher />
		</div>
		<div class="text-center">
			<div class="flex justify-center mb-5">
				<Logo size={34} />
			</div>
			<h1
				class="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent"
			>
				{m.auth_welcome_back()}
			</h1>
			<p class="mt-2 text-sm text-slate-400">{m.auth_login_subtitle()}</p>
		</div>

		<div
			class="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-8 shadow-xl space-y-6"
		>
			<div class="flex border-b border-slate-800">
				<button
					type="button"
					class="flex-1 pb-3 text-sm font-semibold border-b-2 transition duration-200 cursor-pointer {activeTab ===
					'password'
						? 'text-indigo-400 border-indigo-500'
						: 'text-slate-400 border-transparent hover:text-slate-200'}"
					onclick={() => (activeTab = 'password')}
				>
					{m.auth_method_password()}
				</button>
				<button
					type="button"
					class="flex-1 pb-3 text-sm font-semibold border-b-2 transition duration-200 cursor-pointer {activeTab ===
					'magiclink'
						? 'text-indigo-400 border-indigo-500'
						: 'text-slate-400 border-transparent hover:text-slate-200'}"
					onclick={() => (activeTab = 'magiclink')}
				>
					{m.auth_method_magic_link()}
				</button>
			</div>

			{#if form?.error}
				<div
					class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					{form.error}
				</div>
			{/if}

			{#if form?.success && activeTab === 'magiclink'}
				<div
					class="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
				>
					<p class="font-bold">{m.auth_magic_link_sent_title()}</p>
					<p class="text-xs text-slate-300 mt-1">{m.auth_magic_link_sent_body()}</p>
				</div>
			{/if}

			{#if activeTab === 'password'}
				<form
					method="POST"
					action="?/password"
					class="space-y-4"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							submitting = false;
							await update();
						};
					}}
				>
					<div>
						<label
							for="email"
							class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
						>
							{m.auth_email_label()}
						</label>
						<input
							type="email"
							name="email"
							id="email"
							required
							autocomplete="email"
							placeholder={m.auth_email_placeholder()}
							class="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
						/>
					</div>

					<div>
						<div class="flex items-center justify-between mb-1.5">
							<label
								for="password"
								class="block text-xs font-semibold uppercase tracking-wider text-slate-400"
							>
								{m.auth_password_label()}
							</label>
							<a
								href={resolve('/reset-password')}
								class="text-xs text-indigo-400 hover:text-indigo-300 transition"
							>
								{m.auth_forgot_password()}
							</a>
						</div>
						<input
							type="password"
							name="password"
							id="password"
							required
							autocomplete="current-password"
							placeholder="••••••••"
							class="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
						/>
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed py-2 text-sm font-semibold text-white shadow transition cursor-pointer flex items-center justify-center gap-2"
					>
						{#if submitting}
							<svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
							{m.auth_signing_in()}
						{:else}
							{m.auth_sign_in()}
						{/if}
					</button>
				</form>
			{:else}
				<form
					method="POST"
					action="?/magiclink"
					class="space-y-4"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							submitting = false;
							await update();
						};
					}}
				>
					<div>
						<label
							for="magic-email"
							class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
						>
							{m.auth_email_label()}
						</label>
						<input
							type="email"
							name="email"
							id="magic-email"
							required
							autocomplete="email"
							placeholder={m.auth_email_placeholder()}
							class="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
						/>
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed py-2 text-sm font-semibold text-white shadow transition cursor-pointer flex items-center justify-center gap-2"
					>
						{#if submitting}
							<svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
							{m.auth_signing_in()}
						{:else}
							{m.auth_send_magic_link()}
						{/if}
					</button>
				</form>
			{/if}

			<div class="relative flex items-center justify-center my-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-slate-800"></div>
				</div>
				<span
					class="relative px-3 bg-[#0c1325] text-[10px] text-slate-500 uppercase tracking-widest"
				>
					{m.auth_or_divider()}
				</span>
			</div>

			<form method="POST" action="?/google">
				<button
					type="submit"
					class="w-full flex items-center justify-center gap-3 px-4 py-2 border border-slate-800 rounded-lg bg-slate-950/60 hover:bg-slate-900/60 hover:border-slate-700 text-sm font-semibold text-slate-200 shadow transition cursor-pointer"
				>
					<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
					{m.auth_sign_in_with_google()}
				</button>
			</form>

			<div class="border-t border-slate-800/80 pt-4 text-center">
				<p class="text-xs text-slate-400">
					{m.auth_no_account()}
					<a
						href={resolve('/register')}
						class="text-indigo-400 hover:text-indigo-300 transition font-semibold"
					>
						{m.auth_sign_up_link()}
					</a>
				</p>
			</div>
		</div>
	</div>
</div>
