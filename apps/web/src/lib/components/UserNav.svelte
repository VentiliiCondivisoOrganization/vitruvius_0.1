<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	let {
		session,
		compact = false,
		class: className = ''
	}: {
		session: { user: { email?: string | null } } | null;
		/** Hide the email and Settings link, leaving just the language switcher and log out. */
		compact?: boolean;
		class?: string;
	} = $props();
</script>

<!--
	Shared account nav: language switcher + (when signed in) email, settings, log out.
	Single point of change for the header across pages. Wraps on narrow viewports and
	truncates the email so it never overflows on mobile. Pass `compact` to drop the email
	and Settings link (e.g. on the settings page itself).
-->
<div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 min-w-0 ml-auto {className}">
	<LanguageSwitcher />
	{#if session?.user}
		{#if !compact}
			<span class="min-w-0 max-w-[55vw] truncate text-sm text-slate-400 sm:max-w-none"
				>{session.user.email}</span
			>
			<a
				href={resolve('/settings')}
				class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition font-semibold"
			>
				{m.nav_settings()}
			</a>
		{/if}
		<form action="/logout" method="POST">
			<button
				type="submit"
				class="text-xs px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer font-semibold"
			>
				{m.nav_log_out()}
			</button>
		</form>
	{/if}
</div>
