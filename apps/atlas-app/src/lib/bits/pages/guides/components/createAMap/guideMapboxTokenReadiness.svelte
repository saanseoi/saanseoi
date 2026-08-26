<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import mapboxCreateAccessToken from '#lib/assets/guides/mapbox-create-access-token.png'
import mapboxTokenUrlRestrictions from '#lib/assets/guides/mapbox-token-url-restrictions.png'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideScreenshot from '../../components/shared/guideScreenshot.svelte'
import GuideReadinessCompleteSummary from './guideReadinessCompleteSummary.svelte'
import GuideReadinessPanel from './guideReadinessPanel.svelte'

type Props = {
  configured: boolean
  isWebsiteMap: boolean
  onComplete: () => void
  onReset: () => void
  tokenCode: string
  tokenPasteInstruction: string
  terminalProjectPath: string
}

let {
  configured,
  isWebsiteMap,
  onComplete,
  onReset,
  tokenCode,
  tokenPasteInstruction,
  terminalProjectPath,
}: Props = $props()
let expanded = $state(false)
let restrictionsExpanded = $state(false)
</script>

{#snippet mapboxTokenCompleteSummary()}
  <GuideReadinessCompleteSummary
    titleId="mapbox-account-readiness-title"
    eyebrow={m.guide_renderer_mapbox_account_complete_eyebrow()}
    description={m.guide_renderer_mapbox_account_complete_description()}
  />
{/snippet}
{#snippet mapboxTokenIncompleteSummary()}
  <div class="flex items-start gap-3">
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-0.5 size-5 shrink-0 text-[#ffb4b1]"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <p
        id="mapbox-account-readiness-title"
        class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#ffb4b1] uppercase"
      >
        {@html m.guide_renderer_mapbox_account_eyebrow()}
      </p>
      <h3 class="mt-2 font-display text-headline-sm font-bold text-primary">
        {@html m.guide_renderer_mapbox_account_title()}
      </h3>
      <p class="mt-3 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
        {@html m.guide_renderer_mapbox_account_description()}
      </p>
    </div>
  </div>
{/snippet}
{#snippet mapboxTokenDetails()}
  <ol
    class="max-w-3xl list-inside list-decimal space-y-5 font-body text-body-lg leading-8 text-foreground-alt marker:font-semibold marker:text-secondary"
  >
    <li>
      <p class="inline">
        <b>{@html m.guide_renderer_mapbox_account_step_create()}</b>
        {@html m.guide_renderer_mapbox_account_step_create_description()}
      </p>
      <Button
        class="mt-3"
        href="https://account.mapbox.com/auth/signup/"
        variant="secondary"
      >
        <Icon
          icon="material-symbols-light:open-in-new-rounded"
          class="size-4"
          aria-hidden="true"
        />
        {@html m.guide_renderer_mapbox_account_button()}
      </Button>
    </li>
    <li>
      <p class="inline">
        <b>{@html m.guide_renderer_mapbox_account_step_token()}</b>
        {@html m.guide_renderer_mapbox_account_step_token_description()}
      </p>
      <Button
        class="mt-3"
        href="https://console.mapbox.com/account/access-tokens/"
        variant="secondary"
      >
        <Icon
          icon="material-symbols-light:open-in-new-rounded"
          class="size-4"
          aria-hidden="true"
        />
        {@html m.guide_renderer_mapbox_account_step_token_button()}
      </Button>
    </li>
  </ol>
  <div class="mt-5 max-w-3xl">
    <GuideScreenshot
      src={mapboxCreateAccessToken}
      alt={m.guide_renderer_mapbox_account_create_screenshot_alt()}
      caption={m.guide_renderer_mapbox_account_create_screenshot_caption()}
    />
  </div>
  <p class="mt-5 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_renderer_mapbox_account_copy_token()}
  </p>
  <div class="mt-5 max-w-2xl">
    <GuideCodeBlock
      label={m.guide_setup_terminal_label({
        action: m.guide_renderer_mapbox_token_code(),
        path: terminalProjectPath,
      })}
      code={tokenCode}
      language="bash"
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <p class="mt-3 font-body text-body-sm leading-6 text-foreground-alt">
      {@html tokenPasteInstruction}
    </p>
    <p class="mt-3 font-body text-body-sm leading-6 text-foreground-alt">
      {@html m.guide_renderer_mapbox_token_restart()}
    </p>
  </div>
  {#if isWebsiteMap}
    <GuideCallout class="mt-6 max-w-3xl">
      <h4>
        <button
          class="flex w-full cursor-pointer items-center justify-between gap-3 text-left font-display text-headline-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
          type="button"
          aria-expanded={restrictionsExpanded}
          onclick={() =>
                          (restrictionsExpanded = !restrictionsExpanded)}
        >
          {@html m.guide_renderer_mapbox_token_restrictions_title()}
          <Icon
            class={`size-5 shrink-0 transition-transform ${restrictionsExpanded ? 'rotate-180' : ''}`}
            icon="material-symbols-light:expand-more-rounded"
            aria-hidden="true"
          />
        </button>
      </h4>
      {#if restrictionsExpanded}
        <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
          {@html m.guide_renderer_mapbox_token_restrictions_description()}
        </p>
        <div class="mt-5">
          <GuideScreenshot
            src={mapboxTokenUrlRestrictions}
            alt={m.guide_renderer_mapbox_token_restrictions_screenshot_alt()}
            caption={m.guide_renderer_mapbox_token_restrictions_screenshot_caption()}
          />
        </div>
      {/if}
    </GuideCallout>
  {/if}
  <div class="mt-6 flex justify-end">
    {#if configured}
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
        class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
        size="compact"
        onclick={onComplete}
      >
        <Icon
          icon="material-symbols-light:check-rounded"
          class="size-5"
          aria-hidden="true"
        />
        {@html m.guide_renderer_mapbox_account_confirm()}
      </Button>
    {/if}
  </div>
{/snippet}
<GuideReadinessPanel
  id="mapbox-account-readiness"
  complete={configured}
  bind:expanded
  titleId="mapbox-account-readiness-title"
  completeSummary={mapboxTokenCompleteSummary}
  incompleteSummary={mapboxTokenIncompleteSummary}
  details={mapboxTokenDetails}
/>
