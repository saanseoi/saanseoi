<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

type ShareLink = {
  href: string
  icon: string
  label: string
}

type GuideDetail = {
  href?: string
  label: string
  value: string
}

const cardClass = 'border border-border-card bg-surface-container-low p-6 shadow-card'
const shareActionClass =
  'inline-flex size-10 items-center justify-center border border-border-card bg-background text-secondary transition-colors hover:bg-secondary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'
const guideDetails: GuideDetail[] = [
  {
    label: 'Author',
    value: 'Mart van de Ven',
    href: 'https://type.hk',
  },
  { label: 'Published', value: '8 August 2026' },
  { label: 'Last revised', value: '-' },
  { label: 'Version', value: 'v1' },
]

type Props = {
  guideLinkCopied: boolean
  guideLinkCopyFailed: boolean
  onCopyGuideLink: () => void
  onOpenHandover: () => void
  onShareGuide: () => void
  shareLinks: ShareLink[]
}

let {
  guideLinkCopied,
  guideLinkCopyFailed,
  onCopyGuideLink,
  onOpenHandover,
  onShareGuide,
  shareLinks,
}: Props = $props()
</script>

<div class="space-y-6">
  <aside class={cardClass} aria-labelledby="llm-guide-heading">
    <div
      class="flex size-11 items-center justify-center bg-secondary-container text-secondary"
    >
      <Icon icon="proicons:sparkles" class="size-5" />
    </div>
    <h2
      id="llm-guide-heading"
      class="mt-5 font-display text-headline-sm font-bold text-primary"
    >
      {@html m.guide_llm_callout_title()}
    </h2>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      {@html m.guide_llm_callout_intro()}
    </p>
    <ul
      class="mt-4 list-disc space-y-3 pl-5 font-body text-body-sm leading-6 text-foreground-alt"
    >
      <li>{@html m.guide_llm_callout_none()}</li>
      <li>{@html m.guide_llm_callout_implementation()}</li>
      <li>{@html m.guide_llm_callout_handover()}</li>
    </ul>
    <p class="mt-4 font-body text-body-sm leading-6 text-foreground-alt">
      {@html m.guide_llm_callout_outro()}
    </p>
    <div class="mt-6 flex justify-end">
      <Button onclick={onOpenHandover} variant="primary">
        {@html m.guide_llm_handover_button()}
        <Icon icon="proicons:arrow-right" class="size-4" />
      </Button>
    </div>
  </aside>
  <div>
    <section class={cardClass} aria-labelledby="share-guide-heading">
      <h3
        id="share-guide-heading"
        class="font-display text-headline-sm font-bold text-primary"
      >
        {m.guide_share_title()}
      </h3>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        {#each shareLinks as link}
          <a
            class={shareActionClass}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            <Icon icon={link.icon} class="size-4.5" aria-hidden="true" />
          </a>
        {/each}
        <button
          class={shareActionClass}
          type="button"
          onclick={onShareGuide}
          aria-label={m.guide_share_native()}
          title={m.guide_share_native()}
        >
          <Icon icon="proicons:share" class="size-5" aria-hidden="true" />
        </button>
        <button
          class={shareActionClass}
          type="button"
          onclick={onCopyGuideLink}
          aria-label={guideLinkCopied ? m.common_copied() : m.guide_share_copy_link()}
          title={guideLinkCopied ? m.common_copied() : m.guide_share_copy_link()}
        >
          <Icon
            icon={guideLinkCopied ? 'ion:checkmark' : 'ion:copy-outline'}
            class="size-5"
            aria-hidden="true"
          />
        </button>
      </div>
      {#if guideLinkCopyFailed}
        <p class="mt-4 font-body text-body-sm text-error" role="status">
          {m.guide_share_copy_failed()}
        </p>
      {/if}
    </section>
    <dl class="mt-6 space-y-[5px] font-body leading-5">
      {#each guideDetails as detail}
        <div class="flex items-baseline justify-between gap-4">
          <dt class="text-secondary">{detail.label}</dt>
          <dd class="text-right text-foreground-alt">
            {#if detail.href}
              <a
                class="underline decoration-secondary/40 underline-offset-3 transition-colors hover:text-secondary"
                href={detail.href}
                target="_blank"
                rel="noreferrer"
                >{detail.value}</a
              >
            {:else}
              {detail.value}
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
</div>
