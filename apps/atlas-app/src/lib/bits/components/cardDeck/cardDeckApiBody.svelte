<script lang="ts">
import Icon from '@iconify/svelte'

import ApiFacts from './cardDeckApiFacts.svelte'

type Props = {
  active: boolean
  anotherCardActive: boolean
  isLoading?: boolean
  familyLabel: string
  accessLabel: string
  name: string
  description: string
  releasesHref: string
  releasesLabel: string
  docsHref: string
  docsLabel: string
  versionLabel: string
  version: string
  releaseLabel: string
  release: string
}

let {
  active,
  anotherCardActive,
  isLoading = false,
  familyLabel,
  accessLabel,
  name,
  description,
  releasesHref,
  releasesLabel,
  docsHref,
  docsLabel,
  versionLabel,
  version,
  releaseLabel,
  release,
}: Props = $props()

const stopCardInteraction = (event: PointerEvent | MouseEvent) =>
  event.stopPropagation()
</script>

<span class="relative z-2 block min-h-0 px-[6px]">
  <span class={`block min-w-0 ${anotherCardActive ? 'min-[901px]:invisible' : ''}`}>
    <span class="relative flex min-h-5 flex-wrap items-start justify-between gap-2">
      <span
        class="block font-mono text-[0.58rem] leading-none font-bold tracking-[0.16em] uppercase opacity-78"
        >{familyLabel}</span
      >
      <span
        class={`shrink-0 rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_34%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_15%,transparent)] px-2 py-1 font-body text-[0.62rem] leading-none font-extrabold uppercase ${active ? 'min-[901px]:absolute min-[901px]:top-0 min-[901px]:right-0' : ''}`}
        >{accessLabel}</span
      >
    </span>
    <span
      class="mt-1.5 block min-h-[2.1rem] font-[Caveat] text-[clamp(2rem,3.25vw,2.65rem)] leading-[0.78] font-bold tracking-tight"
      >{name}</span
    >
    <span
      class="mt-2 block min-h-[0.72rem] font-body text-[0.64rem] leading-none font-semibold tracking-[0.13em] uppercase opacity-76"
      >{description}</span
    >
    <span class="mt-7 flex flex-wrap items-center gap-2 font-body text-label-md">
      <a
        class="inline-flex items-center gap-[0.28rem] rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_38%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_15%,transparent)] px-3 py-1.5 font-bold no-underline transition-colors hover:border-[color-mix(in_srgb,var(--api-card-foreground)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--api-card-foreground)_26%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_70%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--api-card-foreground)_26%,transparent)] focus-visible:outline-none"
        href={releasesHref}
        onpointerdown={stopCardInteraction}
        onclick={stopCardInteraction}
        >{releasesLabel}</a
      >
      <a
        class="inline-flex items-center gap-[0.28rem] rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_38%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_15%,transparent)] px-3 py-1.5 font-bold no-underline transition-colors hover:border-[color-mix(in_srgb,var(--api-card-foreground)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--api-card-foreground)_26%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_70%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--api-card-foreground)_26%,transparent)] focus-visible:outline-none"
        href={docsHref}
        target="_blank"
        rel="noreferrer"
        onpointerdown={stopCardInteraction}
        onclick={stopCardInteraction}
        >{docsLabel}
        <Icon icon="proicons:arrow-up-right" class="size-4" /></a
      >
    </span>
  </span>
  <ApiFacts {active} {isLoading} {versionLabel} {version} {releaseLabel} {release} />
</span>
