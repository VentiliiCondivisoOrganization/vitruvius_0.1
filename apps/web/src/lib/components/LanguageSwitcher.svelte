<script lang="ts">
	import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';

	// Cookie-based locale switching: setLocale() writes the PARAGLIDE_LOCALE cookie and
	// reloads so SSR re-renders every message in the chosen language. URLs are unchanged.
	const labels: Record<Locale, () => string> = {
		en: m.lang_en,
		it: m.lang_it,
		es: m.lang_es,
		fr: m.lang_fr
	};

	const current = $derived(getLocale());

	function onChange(event: Event): void {
		const next = (event.currentTarget as HTMLSelectElement).value as Locale;
		if (next !== current) setLocale(next);
	}
</script>

<label class="relative inline-flex items-center">
	<span class="sr-only">{m.lang_switcher_label()}</span>
	<svg
		class="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		aria-hidden="true"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
		/>
	</svg>
	<select
		value={current}
		onchange={onChange}
		aria-label={m.lang_switcher_label()}
		class="cursor-pointer appearance-none rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-7 pr-7 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:text-white focus:border-indigo-500 focus:outline-none"
	>
		{#each locales as locale (locale)}
			<option value={locale} class="bg-slate-950 text-slate-200">{labels[locale]()}</option>
		{/each}
	</select>
	<svg
		class="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
	</svg>
</label>
