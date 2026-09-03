<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

import GuideReadinessCompleteToggle from './guideReadinessCompleteToggle.svelte'
import GuideReadinessIncompleteSummary from './guideReadinessIncompleteSummary.svelte'
import GuideReadinessPanel from './guideReadinessPanel.svelte'

type Props = {
  complete: boolean
  completeDescription: string
  completeEyebrow: string
  doneLabel: string
  id: string
  incompleteDescription: string
  incompleteEyebrow: string
  onComplete: () => void
  onReset: () => void
  titleId: string
}

let {
  complete,
  completeDescription,
  completeEyebrow,
  doneLabel,
  id,
  incompleteDescription,
  incompleteEyebrow,
  onComplete,
  onReset,
  titleId,
}: Props = $props()
let expanded = $state(false)
</script>

<GuideReadinessPanel {id} {complete} {titleId}>
  {#if complete}
    <GuideReadinessCompleteToggle
      detailsId={`${id}-details`}
      eyebrow={completeEyebrow}
      description={completeDescription}
      {titleId}
      bind:expanded
    />
  {:else}
    <GuideReadinessIncompleteSummary
      {titleId}
      eyebrow={incompleteEyebrow}
      description={incompleteDescription}
    />
  {/if}

  {#if !complete || expanded}
    <div
      id={`${id}-details`}
      class={complete ? 'mt-5 border-t border-secondary/35 pt-6 dark:border-[#6fdec9]/35' : 'mt-5'}
    >
      <div class="flex flex-wrap items-center justify-end gap-3">
        {#if complete}
          <Button size="compact" variant="secondary" onclick={onReset}>
            <Icon
              icon="material-symbols-light:restart-alt-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {@html m.guide_readiness_reset()}
          </Button>
        {:else}
          <Button
            class="bg-secondary text-on-secondary hover:bg-secondary/85"
            size="compact"
            onclick={onComplete}
          >
            <Icon
              icon="material-symbols-light:check-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {@html doneLabel}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</GuideReadinessPanel>
