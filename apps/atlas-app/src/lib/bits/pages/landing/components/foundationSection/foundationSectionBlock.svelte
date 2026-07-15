<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import { cn } from '$lib/bits/utilities/helpers/cn'

export type FoundationSectionLabel = {
  number: string
  eyebrow: () => string
  tone: 'humane' | 'data' | 'projects'
  title: () => string
  description: () => string
  href: string
  cta: () => string
  x: number
  y: number
  align: 'left' | 'right'
}

type Props = {
  label: FoundationSectionLabel
  isVisible: boolean
  usesCjkEyebrows: boolean
}

let { label, isVisible, usesCjkEyebrows }: Props = $props()

const blockClass = $derived(
  cn(
    'foundation-section-block absolute block w-[min(18.5rem,23vw)] -translate-x-1/2 -translate-y-1/2 text-primary no-underline transition-[opacity,translate,filter] duration-620 [transition-timing-function:cubic-bezier(0.2,0.7,0.2,1)] min-[786px]:w-[min(22rem,32vw)] max-[785px]:static max-[785px]:min-h-48 max-[785px]:w-full max-[785px]:translate-x-0 max-[785px]:translate-y-0 max-[785px]:py-[1.05rem] max-[785px]:pr-0 max-[785px]:pl-[calc(var(--mobile-marker-size)+1rem)] max-[785px]:text-left',
    label.tone === 'data' &&
      'max-[785px]:pr-[calc(var(--mobile-marker-size)+0.5rem)] max-[785px]:pl-0',
    isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
    label.align === 'right' && 'text-right',
  ),
)
const blockStyle = $derived(
  `--label-accent: var(--tertiary-fixed-dim); --mobile-marker-size: 4.25rem; top: ${label.y}%; left: ${label.x}%; transition-delay: ${
    label.tone === 'humane' ? '140ms' : label.tone === 'data' ? '240ms' : '340ms'
  }`,
)
</script>

{#snippet content()}
  <span
    class={cn(
      "absolute top-[1.05rem] left-0 z-1 inline-grid aspect-square w-(--mobile-marker-size) place-items-center rounded-full border border-current bg-[color-mix(in_srgb,currentColor_11%,var(--surface-container-lowest))] font-display text-[1.45rem] leading-none font-black text-(--label-accent) shadow-[0_0_0_0.34rem_color-mix(in_srgb,currentColor_7%,transparent),0_0.85rem_2rem_rgb(0_0_0/0.16)] before:absolute before:inset-[-0.34rem] before:-z-1 before:rounded-[inherit] before:border-2 before:border-current before:opacity-42 before:content-[''] before:scale-[0.94] min-[786px]:hidden",
      label.tone === 'data' && 'max-[785px]:right-0 max-[785px]:left-auto',
    )}
  >
    {label.number}
  </span>
  <div
    class="inline-flex items-baseline gap-1 bg-(--foundation-map-background) px-[0.32rem] py-[0.12rem] font-body text-[0.76rem] font-black uppercase tracking-[0.14em] text-secondary max-[785px]:block max-[785px]:bg-transparent max-[785px]:p-0 max-[785px]:text-[0.72rem]"
    class:-translate-y-0.5={usesCjkEyebrows}
  >
    {#if label.tone === 'data'}
      <span>{label.eyebrow()}</span>
      <span class="max-[785px]:hidden">//</span>
      <span class="max-[785px]:hidden">{label.number}</span>
    {:else}
      <span class="max-[785px]:hidden">{label.number}</span>
      <span class="max-[785px]:hidden">//</span>
      <span>{label.eyebrow()}</span>
    {/if}
  </div>
  <h3
    class="mt-[0.2rem] font-display text-[clamp(1.8rem,2.75vw,3.05rem)] leading-[0.9] font-black text-primary [text-shadow:0_1px_0_var(--foundation-map-background)] max-[785px]:mt-[0.55rem] max-[785px]:text-[clamp(2.05rem,10.5vw,3.15rem)] dark:text-white"
  >
    {label.title()}
  </h3>
  <p
    class={cn(
      'mt-[0.8rem] block max-w-88 bg-transparent font-body text-[clamp(0.9rem,1.1vw,1.05rem)] leading-[1.65] text-[color-mix(in_srgb,var(--foreground-alt)_82%,transparent)] text-balance max-[785px]:mt-[0.9rem] max-[785px]:w-[min(20.5rem,calc(100%+2rem))] max-[785px]:max-w-none dark:text-white/78',
      label.align === 'right' && 'ml-auto',
    )}
  >
    <span
      class="bg-[color-mix(in_srgb,var(--foundation-map-background)_90%,transparent)] px-[0.26rem] pt-[0.08rem] pb-[0.14rem] [-webkit-box-decoration-break:clone] [box-decoration-break:clone] dark:bg-[#131311db]"
    >
      {@html label.description()}
    </span>
  </p>
  <small
    class={cn(
      'mt-[0.65rem] block w-fit bg-[color-mix(in_srgb,var(--foundation-map-background)_92%,transparent)] px-[0.3rem] pt-[0.12rem] pb-[0.16rem] font-body text-[0.82rem] font-extrabold uppercase tracking-[0.08em] text-on-tertiary-container max-[785px]:mt-[0.95rem] max-[785px]:bg-transparent max-[785px]:p-0 dark:bg-[#131311db]',
      label.align === 'right' && 'ml-auto',
    )}
  >
    {#if label.tone === 'projects'}
      {m.foundation_community_apps_coming_soon()}
    {:else}
      {label.cta()}
      ↗
    {/if}
  </small>
{/snippet}

{#if label.tone === 'projects'}
  <div class={blockClass} style={blockStyle}>
    {@render content()}
  </div>
{:else}
  <a class={blockClass} href={label.href} style={blockStyle}> {@render content()} </a>
{/if}

<style>
@media (max-width: 785px) {
  .foundation-section-block::after {
    position: absolute;
    top: calc(1.05rem + var(--mobile-marker-size));
    left: calc(var(--mobile-marker-size) / 2);
    width: 1px;
    height: calc(100% - 1.1rem);
    content: "";
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--label-accent) 56%, transparent),
      transparent
    );
  }

  .foundation-section-block:nth-child(2)::after {
    right: calc(var(--mobile-marker-size) / 2);
    left: auto;
  }
}
</style>
