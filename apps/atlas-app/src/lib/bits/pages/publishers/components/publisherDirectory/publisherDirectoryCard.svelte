<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { getPublisherLogo } from '#lib/registry/publisherLogo.js'

import { publisherAccent, publisherIconBackdrop } from '../../publisherPresentation.js'
import type { PublisherDirectoryItem } from '../../types.js'

type Props = {
  publisher: PublisherDirectoryItem
}

let { publisher }: Props = $props()
let locale = $derived(getCurrentLocale())
let localisedPublisher = $derived(selectLocalisedRow(publisher.publisherI18n, locale))
</script>

<a
  class="group relative isolate flex h-64 overflow-hidden rounded-[1.1rem] border border-[color-mix(in_srgb,var(--publisher-card-frame)_28%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--publisher-accent)_86%,white),var(--publisher-accent))] p-[0.45rem] text-(--publisher-card-foreground) transition-colors hover:border-[color-mix(in_srgb,var(--publisher-card-frame)_64%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--publisher-card-frame)_70%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary dark:bg-[linear-gradient(160deg,color-mix(in_srgb,var(--publisher-accent)_72%,black),color-mix(in_srgb,var(--publisher-accent)_88%,black))]"
  href={`/publishers/${publisher.code}`}
  style={`--publisher-accent: ${publisherAccent(publisher.code)}; --publisher-card-frame: #fff9ed; --publisher-card-foreground: #fff;`}
>
  <div
    class="relative z-1 flex size-full min-h-0 flex-col overflow-hidden rounded-[0.72rem] border-2 border-[color-mix(in_srgb,var(--publisher-card-frame)_70%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--publisher-accent)_86%,white),var(--publisher-accent))] px-4 pt-4 pb-3 dark:bg-[linear-gradient(160deg,color-mix(in_srgb,var(--publisher-accent)_72%,black),color-mix(in_srgb,var(--publisher-accent)_88%,black))]"
  >
    <img
      class="pointer-events-none absolute inset-y-0 left-0 z-0 h-full w-[72%] object-cover object-left opacity-25 blur-[7px] mix-blend-screen brightness-105 saturate-75 dark:opacity-27 dark:brightness-115"
      src={getPublisherLogo(publisher.code)}
      alt=""
      aria-hidden="true"
      style="mask-image: linear-gradient(to right, black 0%, black 58%, rgba(0,0,0,0.8) 72%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 0%, black 58%, rgba(0,0,0,0.8) 72%, transparent 100%); object-position: 5% 60%; transform: scale(1.11); transform-origin: left center;"
    >
    <div class="relative z-1 flex items-start justify-between gap-4">
      <h2
        class="min-w-0 pt-1 font-display text-headline-md leading-tight font-bold text-(--publisher-card-foreground)"
      >
        {localisedPublisher?.name ?? publisher.code}
      </h2>
      <div class="flex shrink-0 items-start">
        <span
          class="flex size-14 items-center justify-center rounded-md border border-white/45 p-2 shadow-[inset_0_1px_rgb(255_255_255/0.36)]"
          style={`background: ${publisherIconBackdrop(publisher.code)};`}
        >
          <img
            class="size-10 max-h-full max-w-full object-contain"
            src={getPublisherLogo(publisher.code)}
            alt=""
          >
        </span>
      </div>
    </div>
    <p
      class="relative z-1 mt-5 line-clamp-3 font-body text-[1.0625rem] leading-6 font-medium text-[color-mix(in_srgb,var(--publisher-card-foreground)_100%,transparent)] dark:text-[color-mix(in_srgb,var(--publisher-card-foreground)_100%,transparent)]"
    >
      {localisedPublisher?.description ?? ''}
      <Icon
        icon="ion:arrow-forward-outline"
        class="relative -top-px inline size-5 text-(--publisher-card-foreground) transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </p>
    <div
      class="relative z-1 mt-auto flex items-center justify-between gap-4 border-t border-[color-mix(in_srgb,var(--publisher-card-foreground)_28%,transparent)] pt-3"
    >
      <span class="relative z-10 flex min-w-0 flex-1 items-center gap-2">
        {#if publisher.isInstitution}
          <span
            class="inline-flex size-5 shrink-0 items-center justify-center rounded border border-[color-mix(in_srgb,var(--publisher-card-foreground)_38%,transparent)] bg-[color-mix(in_srgb,var(--publisher-card-foreground)_15%,transparent)] text-(--publisher-card-foreground)"
            title={m.publishers_institution()}
          >
            <Icon
              icon="material-symbols-light:account-balance"
              class="size-3.5"
              aria-hidden="true"
            />
            <span class="sr-only">{m.publishers_institution()}</span>
          </span>
        {/if}
        <span
          class="shrink-0 whitespace-nowrap font-mono text-label-sm font-semibold tracking-[0.08em] uppercase text-(--publisher-card-foreground)"
          >{publisher.code}</span
        >
      </span>
      <span
        class="relative z-10 inline-flex shrink-0 items-baseline gap-[7px] font-mono text-label-sm font-semibold tracking-[0.08em] uppercase text-(--publisher-card-foreground)"
      >
        <span
          class="relative -top-px font-body text-[0.6125rem] font-semibold tracking-[0.08em] uppercase opacity-80"
          >{m.publishers_datasets_label()}</span
        >
        <span class="font-mono text-label-sm font-semibold"
          >{publisher.sourceCount}</span
        >
      </span>
    </div>
  </div>
</a>
