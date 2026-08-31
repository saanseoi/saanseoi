<script lang="ts">
import { tick, type Snippet } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'
import {
  GuideReadinessCompleteSummary,
  GuideReadinessPanel,
} from '#lib/bits/pages/guides/index.js'
import { Button } from '#lib/bits/primitives/button/index.js'

type Props = {
  children?: Snippet
  complete: boolean
  completeAction: string
  description: string
  eyebrow: string
  id: string
  onComplete: () => void
  onReset: () => void
  resetDescription: string
  resetLabel: string
  scrollTargetId: string
  titleId: string
}

let {
  children,
  complete,
  completeAction,
  description,
  eyebrow,
  id,
  onComplete,
  onReset,
  resetDescription,
  resetLabel,
  scrollTargetId,
  titleId,
}: Props = $props()
let expanded = $state(false)

const completeAndScroll = async () => {
  onComplete()
  await tick()
  requestAnimationFrame(() => {
    const target = document.getElementById(scrollTargetId)
    if (!target) return

    const headerHeight =
      document.querySelector('header')?.getBoundingClientRect().height ?? 72
    window.scrollTo({
      top: Math.max(
        0,
        window.scrollY + target.getBoundingClientRect().top - headerHeight - 64,
      ),
    })
  })
}
</script>

{#snippet completeSummary()}
  <GuideReadinessCompleteSummary {description} {eyebrow} {titleId} />
{/snippet}

{#snippet completeDetails()}
  <div class="flex items-center justify-between gap-4">
    <p class="font-body text-body-lg leading-8 text-foreground-alt">
      {resetDescription}
    </p>
    <Button class="shrink-0" size="compact" variant="secondary" onclick={onReset}>
      <Icon
        icon="material-symbols-light:restart-alt-rounded"
        class="size-5"
        aria-hidden="true"
      />
      {resetLabel}
    </Button>
  </div>
{/snippet}

{#if complete}
  <GuideReadinessPanel
    {id}
    complete
    bind:expanded
    {titleId}
    {completeSummary}
    details={completeDetails}
  />
{:else}
  <div class="mt-5">
    {@render children?.()}
  </div>
  <div class="mt-6 flex justify-end">
    <Button
      class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
      size="compact"
      onclick={() => void completeAndScroll()}
    >
      <Icon
        icon="material-symbols-light:check-rounded"
        class="size-5"
        aria-hidden="true"
      />
      {completeAction}
    </Button>
  </div>
{/if}
