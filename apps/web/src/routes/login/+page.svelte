<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
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
			<div
				class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60 text-xs font-semibold tracking-wider text-slate-400 uppercase mb-4"
			>
				<span class="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
				{m.brand_engine_version()}
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
			{#if form?.error}
				<div
					class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
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
