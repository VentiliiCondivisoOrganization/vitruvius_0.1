<script module lang="ts">
	// Per-instance counter so each inline gradient gets a unique, SSR-stable id.
	let instances = 0;
</script>

<script lang="ts">
	interface Props {
		/** lockup = mark + wordmark (default); mark = symbol only; stacked = mark over wordmark. */
		variant?: 'lockup' | 'mark' | 'stacked';
		/** Mark height in px. The wordmark scales from this. */
		size?: number;
		/** Tone of the wordmark text. The mark keeps its brand colors in every tone. */
		tone?: 'vellum' | 'ink';
		class?: string;
	}

	let { variant = 'lockup', size = 30, tone = 'vellum', class: cls = '' }: Props = $props();

	instances += 1;
	const uid = `vt-logo-${instances}`;
	const wordSize = $derived(Math.round(size * 0.62 * 10) / 10);
	const arcStroke = $derived(tone === 'ink' ? '#1E6E86' : '#5BC4DE');
	const wordColor = $derived(tone === 'ink' ? '#16203A' : '#F4EEE1');
	// The brand name is a proper noun — intentionally never localized.
	const WORDMARK = 'VITRUVIUS';
</script>

{#snippet mark()}
	<svg
		viewBox="0 0 48 48"
		style="height:{size}px;width:{size}px"
		role="img"
		aria-label="Vitruvius"
		class="shrink-0"
	>
		<defs>
			<linearGradient id={uid} x1="11" y1="13" x2="33" y2="38" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="#F4CC7C" />
				<stop offset=".48" stop-color="#E6982F" />
				<stop offset="1" stop-color="#BC5326" />
			</linearGradient>
		</defs>
		<path
			d="M13 12.5 A 16 16 0 0 1 35 12.5"
			fill="none"
			stroke={arcStroke}
			stroke-width="2.2"
			stroke-linecap="round"
		/>
		<path
			d="M11 13 L24 38 L37 13"
			fill="none"
			stroke="url(#{uid})"
			stroke-width="5.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle cx="24" cy="38" r="2.4" fill={arcStroke} />
	</svg>
{/snippet}

{#if variant === 'mark'}
	<span class={cls}>{@render mark()}</span>
{:else if variant === 'stacked'}
	<span class="inline-flex flex-col items-center gap-2 {cls}">
		{@render mark()}
		<span
			class="font-display font-extrabold leading-none"
			style="font-size:{wordSize}px;letter-spacing:0.14em;color:{wordColor}">{WORDMARK}</span
		>
	</span>
{:else}
	<span class="inline-flex items-center gap-2.5 {cls}">
		{@render mark()}
		<span
			class="font-display font-extrabold leading-none"
			style="font-size:{wordSize}px;letter-spacing:0.12em;color:{wordColor}">{WORDMARK}</span
		>
	</span>
{/if}
