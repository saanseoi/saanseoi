<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

import GuideCreateAMapPricingTable from './guideCreateAMapPricingTable.svelte'
import GuideReadinessCompleteToggle from './guideReadinessCompleteToggle.svelte'
import GuideReadinessIncompleteSummary from './guideReadinessIncompleteSummary.svelte'
import GuideReadinessPanel from './guideReadinessPanel.svelte'

type PricingOption = { detail?: string; label: string; price?: string }

type Props = {
  complete: boolean
  completeDescription: string
  completeEyebrow: string
  incompleteDescription: string
  incompleteEyebrow: string
  installation?: { href: string; label: string }
  installationPrefix: string
  installationSuffix: string
  onComplete: () => void
  onReset: () => void
  pricingOptions?: PricingOption[]
  welcomeDescription?: string
}

let {
  complete,
  completeDescription,
  completeEyebrow,
  incompleteDescription,
  incompleteEyebrow,
  installation,
  installationPrefix,
  installationSuffix,
  onComplete,
  onReset,
  pricingOptions,
  welcomeDescription,
}: Props = $props()
let expanded = $state(false)
</script>

<GuideReadinessPanel
  id="code-editor-readiness"
  {complete}
  titleId="code-editor-readiness-title"
>
  {#if complete}
    <GuideReadinessCompleteToggle
      detailsId="code-editor-readiness-details"
      eyebrow={completeEyebrow}
      description={completeDescription}
      titleId="code-editor-readiness-title"
      bind:expanded
    />
  {:else}
    <GuideReadinessIncompleteSummary
      titleId="code-editor-readiness-title"
      eyebrow={incompleteEyebrow}
      description={incompleteDescription}
    >
      {#if installation}
        <div
          class="mt-4 flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-2 font-body text-body-md leading-7 text-foreground-alt"
        >
          <span>{installationPrefix}</span>
          <Button href={installation.href} size="compact" variant="secondary">
            <Icon
              icon="proicons:arrow-down-to-bracket"
              class="size-4"
              aria-hidden="true"
            />
            {@html installation.label}
          </Button>
          <span>{installationSuffix}</span>
        </div>
      {/if}
      {#if pricingOptions}
        <GuideCreateAMapPricingTable options={pricingOptions} />
      {/if}
    </GuideReadinessIncompleteSummary>
  {/if}

  {#if !complete || expanded}
    <div
      id="code-editor-readiness-details"
      class={`ml-8 ${complete ? 'mt-5 border-t border-[#6fdec9]/35 pt-5' : 'mt-4'}`}
    >
      {#if complete}
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html completeDescription}
        </p>
      {/if}
      {#if welcomeDescription}
        <p class="mt-5 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html welcomeDescription}
        </p>
      {/if}
      <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
        {#if !complete}
          <Button
            class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
            onclick={onComplete}
          >
            <Icon
              icon="material-symbols-light:check-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {m.guide_code_editor_readiness_done()}
          </Button>
        {:else}
          <Button size="compact" variant="secondary" onclick={onReset}>
            <Icon
              icon="material-symbols-light:restart-alt-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {m.guide_readiness_reset()}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</GuideReadinessPanel>
