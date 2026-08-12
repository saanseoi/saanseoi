<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

import GuideCreateAMapModelTable from './guideCreateAMapModelTable.svelte'
import GuideCreateAMapPricingTable from './guideCreateAMapPricingTable.svelte'
import GuideReadinessCompleteToggle from './guideReadinessCompleteToggle.svelte'
import GuideReadinessIncompleteSummary from './guideReadinessIncompleteSummary.svelte'
import GuideReadinessPanel from './guideReadinessPanel.svelte'
import GuideCreateAMapZedSetup from '../../patterns/createAMap/guideCreateAMapZedSetup.svelte'

type PricingOption = { detail?: string; label: string; price?: string }
type LlmOption = {
  icon?: string
  setupUrl?: string
  signUpUrl?: string
  supportsOpenRouter?: boolean
}

type Props = {
  agentModel?: string
  agentPricing?: { options: PricingOption[]; paymentNote?: string }
  aiAccess?: 'agentic' | 'web'
  chatPricing?: { options: PricingOption[] }
  complete: boolean
  completeDescription: string
  detailsDescription: string
  incompleteDescription: string
  isZedSetupGuideProvided: boolean
  onComplete: () => void
  onOpenZedSetup: () => void
  onReset: () => void
  operatingSystem?: 'windows' | 'macos' | 'linux'
  option: LlmOption
  prompt: string
  zedSetupContentExpanded: boolean
  zedSetupExpanded: boolean
  onZedSetupContentExpandedChange: (expanded: boolean) => void
}

let {
  agentModel,
  agentPricing,
  aiAccess,
  chatPricing,
  complete,
  completeDescription,
  detailsDescription,
  incompleteDescription,
  isZedSetupGuideProvided,
  onComplete,
  onOpenZedSetup,
  onReset,
  operatingSystem,
  option,
  prompt,
  zedSetupContentExpanded,
  zedSetupExpanded,
  onZedSetupContentExpandedChange,
}: Props = $props()

let expanded = $state(false)
</script>

<GuideReadinessPanel id="llm-readiness" {complete} titleId="llm-readiness-title">
  {#if complete}
    <GuideReadinessCompleteToggle
      detailsId="llm-readiness-details"
      eyebrow={m.guide_agentic_ai_readiness_complete_eyebrow()}
      description={completeDescription}
      titleId="llm-readiness-title"
      bind:expanded
    />
  {:else}
    <GuideReadinessIncompleteSummary
      titleId="llm-readiness-title"
      eyebrow={m.guide_agentic_ai_readiness_eyebrow()}
      description={incompleteDescription}
    >
      {#if aiAccess === 'agentic' && agentPricing}
        <GuideCreateAMapPricingTable options={agentPricing.options} />
      {/if}
      {#if aiAccess === 'agentic' && agentModel}
        <GuideCreateAMapModelTable model={agentModel} />
      {/if}
      {#if aiAccess === 'web' && chatPricing}
        <GuideCreateAMapPricingTable options={chatPricing.options} />
      {/if}
      {#if aiAccess === 'web' && option.signUpUrl}
        <p class="mt-2 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_agentic_ai_readiness_chat_sign_up_prompt()}
        </p>
      {/if}
    </GuideReadinessIncompleteSummary>
  {/if}

  {#if !complete || expanded}
    <div
      id="llm-readiness-details"
      class={`ml-8 ${complete ? 'mt-10 border-t border-[#6fdec9]/35 pt-0' : 'mt-5'}`}
    >
      {#if complete}
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html detailsDescription}
        </p>
        {#if aiAccess === 'web' && option.signUpUrl}
          <p
            class="mt-2 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
          >
            {@html m.guide_agentic_ai_readiness_chat_sign_up_prompt()}
          </p>
        {/if}
      {/if}
      <div class="mt-5 flex flex-wrap items-center justify-end gap-3">
        {#if aiAccess === 'agentic' && agentPricing?.paymentNote}
          <p
            class="mr-auto min-w-0 flex-1 font-[Krypton,var(--font-mono)] text-body-md leading-7 text-[#ffb4b1]"
          >
            {@html agentPricing.paymentNote}
          </p>
        {/if}
        {#if aiAccess === 'agentic' && isZedSetupGuideProvided}
          <Button
            size="compact"
            variant="secondary"
            class="shrink-0 px-4"
            aria-controls="zed-setup-guide"
            aria-expanded={zedSetupExpanded}
            onclick={onOpenZedSetup}
          >
            <Icon icon="proicons:book-open" class="size-4" aria-hidden="true" />
            {@html m.guide_agentic_ai_readiness_setup()}
          </Button>
        {:else if option.setupUrl}
          <Button
            href={option.setupUrl}
            size="compact"
            variant="secondary"
            class="shrink-0 px-4"
          >
            <Icon icon="proicons:book-open" class="size-4" aria-hidden="true" />
            {@html m.guide_agentic_ai_readiness_setup()}
          </Button>
        {/if}
        {#if option.signUpUrl}
          <Button href={option.signUpUrl} size="compact" variant="secondary">
            <Icon
              icon={aiAccess === 'web' ? (option.icon ?? 'proicons:user-add') : 'proicons:user-add'}
              class="size-4"
              aria-hidden="true"
            />
            {@html m.guide_agentic_ai_readiness_sign_up()}
          </Button>
        {/if}
        {#if option.signUpUrl && option.supportsOpenRouter}
          <span
            class="font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-foreground-alt"
          >
            {@html m.guide_agentic_ai_readiness_or()}
          </span>
        {/if}
        {#if option.supportsOpenRouter}
          <Button
            href="https://openrouter.ai/sign-up"
            size="compact"
            variant="secondary"
          >
            <Icon icon="proicons:credit-card" class="size-4" aria-hidden="true" />
            {@html m.guide_agentic_ai_readiness_openrouter()}
          </Button>
        {/if}
        {#if !complete}
          <Button
            class="shrink-0 px-4 bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
            size="compact"
            onclick={onComplete}
          >
            <Icon
              icon="material-symbols-light:check-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {@html m.guide_agentic_ai_readiness_done()}
          </Button>
        {:else}
          <Button
            size="compact"
            variant="secondary"
            class="shrink-0 px-4"
            onclick={onReset}
          >
            <Icon
              icon="material-symbols-light:restart-alt-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {@html m.guide_readiness_reset()}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</GuideReadinessPanel>

{#if aiAccess === 'web' && complete}
  <p class="-mt-7 mb-12 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    {m.guide_agentic_ai_primer_chat_tools_free_tier_hint()}
  </p>
{/if}
{#if isZedSetupGuideProvided && zedSetupExpanded}
  <GuideCreateAMapZedSetup
    expanded={zedSetupContentExpanded}
    {operatingSystem}
    {onComplete}
    onExpandedChange={onZedSetupContentExpandedChange}
    {prompt}
  />
{/if}
