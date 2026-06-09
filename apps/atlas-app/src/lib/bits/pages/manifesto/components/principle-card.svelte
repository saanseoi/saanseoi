<script lang="ts">
import type { Snippet } from 'svelte'
import topo from '$lib/assets/topo.jpg'

type Tone = 'default' | 'accent' | 'highlight' | 'plain'
type Align = 'left' | 'center'

type Props = {
  children?: Snippet
  number: string
  section: string
  lead: string
  body: string
  tone?: Tone
  align?: Align
  featured?: boolean
  emphasizedTitle?: boolean
}

let {
  children,
  number,
  section,
  lead,
  body,
  tone = 'default',
  align = 'left',
  featured = false,
  emphasizedTitle = false,
}: Props = $props()

const toneClass: Record<Tone, string> = {
  default: 'manifesto-surface border border-border-card/55',
  accent: 'manifesto-accent-surface border border-secondary/30',
  highlight: 'manifesto-highlight-surface border-2 border-secondary',
  plain: 'border-transparent bg-transparent shadow-none',
}
</script>

<article
  class={`manifesto-card relative self-start ${featured ? 'overflow-visible' : 'overflow-hidden'} p-8 ${toneClass[tone]} ${tone === 'plain' ? 'manifesto-plain max-w-5xl' : ''} ${
    align === 'center' ? 'mx-auto max-w-4xl py-10 text-center md:py-14' : ''
  } ${tone === 'highlight' ? 'text-center md:p-12 lg:p-18' : ''} ${featured ? 'md:p-12' : 'md:p-10'}`}
>
  {#if featured}
    <div
      class="absolute top-0 left-0 inline-flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-sm font-bold text-on-secondary shadow-mini sm:h-12 sm:w-12"
    >
      {number}
    </div>
  {/if}

  {#if tone === 'highlight'}
    <div aria-hidden="true" class="absolute inset-0">
      <img
        alt=""
        class="dark-invert-image absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 scale-40 object-cover object-center opacity-24! blur-md!"
        src={topo}
      >
      <div class="manifesto-highlight-overlay absolute inset-0"></div>
    </div>
  {/if}

  <div
    class={`relative ${tone === 'highlight' ? 'z-10 mx-auto max-w-4xl' : ''} ${featured ? 'pt-4' : ''}`}
  >
    {#if featured}
      <p
        class="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-secondary"
      >
        {section}
      </p>
    {:else}
      <p
        class="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-secondary"
      >
        {number}
        // {section}
      </p>
    {/if}

    <h2
      class={`font-display font-bold ${
        align === 'center'
          ? 'mt-4 text-[2.5rem] leading-[0.97] tracking-tighter text-secondary sm:text-[3.6rem] md:text-[4.4rem]'
          : featured
            ? 'mt-4 text-[2.1rem] leading-[0.98] tracking-tighter text-primary sm:text-display-md md:text-[3.4rem]'
            : tone === 'highlight'
              ? 'mt-5 text-[2.9rem] leading-[0.92] tracking-[-0.06em] text-primary sm:text-[4.2rem] md:text-[5.1rem]'
              : `mt-4 text-[1.8rem] leading-[1.04] tracking-display-lg ${emphasizedTitle ? 'text-secondary' : 'text-primary'} sm:text-[2.3rem]`
      }`}
    >
      {lead}
    </h2>

    <p
      class={`font-body ${
        align === 'center'
          ? 'mx-auto mt-8 max-w-3xl text-[1.12rem] leading-[1.8] text-primary italic sm:text-[1.35rem]'
          : tone === 'highlight'
            ? 'mx-auto mt-8 max-w-3xl text-[1.08rem] leading-[1.9] text-foreground-alt sm:text-[1.3rem]'
            : featured
              ? 'mt-6 text-[1.05rem] leading-[1.8] text-foreground-alt sm:text-[1.2rem]'
              : 'mt-4 text-[0.98rem] leading-[1.8] text-foreground-alt sm:text-body-md'
      }`}
    >
      {@html body}
    </p>

    {@render children?.()}
  </div>
</article>

<style>
.manifesto-card {
  box-shadow: var(--shadow-card);
  transition:
    transform 280ms ease-out,
    border-color 280ms ease-out;
  will-change: transform;
}

.manifesto-card:hover {
  transform: translate3d(0, -0.375rem, 0);
}

.manifesto-surface {
  background: color-mix(in srgb, var(--background-alt) 88%, transparent);
}

.manifesto-accent-surface {
  background: color-mix(in srgb, var(--secondary) 10%, var(--background-alt));
}

.manifesto-highlight-surface {
  background: #0f5e55;
  color: rgb(247 246 240 / 0.96);
}

.manifesto-highlight-surface :global(.text-primary) {
  color: rgb(252 251 247 / 0.98);
}

.manifesto-highlight-surface :global(.text-foreground-alt) {
  color: rgb(236 241 236 / 0.82);
}

.manifesto-highlight-surface :global(.text-secondary) {
  color: rgb(220 255 245 / 0.88);
}

.manifesto-highlight-overlay {
  background:
    linear-gradient(180deg, rgb(8 61 55 / 0.3), rgb(8 61 55 / 0.22)),
    radial-gradient(circle at top, rgb(255 255 255 / 0.08), transparent 48%);
}

.manifesto-plain :global(.text-secondary) {
  color: var(--secondary);
}

.manifesto-plain :global(.text-primary) {
  color: var(--foreground);
}

.manifesto-plain :global(.text-foreground-alt) {
  color: var(--foreground-alt);
}

.shadow-none {
  box-shadow: none;
}

:global(.dark) .manifesto-surface {
  background: color-mix(in srgb, var(--surface-container-high) 86%, transparent);
}

:global(.dark) .manifesto-accent-surface {
  background: color-mix(
    in srgb,
    var(--secondary-container) 18%,
    var(--surface-container-low)
  );
}

:global(.dark) .manifesto-plain :global(.text-secondary) {
  color: var(--secondary-fixed);
}

@media (prefers-reduced-motion: reduce) {
  .manifesto-card {
    transition: none;
  }

  .manifesto-card:hover {
    transform: none;
  }
}
</style>
