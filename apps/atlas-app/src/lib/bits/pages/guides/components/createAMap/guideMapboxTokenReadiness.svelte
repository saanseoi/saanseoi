<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import mapboxCreateAccessToken from '#lib/assets/guides/mapbox-create-access-token.png'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

import GuideEnvironmentFileSetup from '../../components/shared/guideEnvironmentFileSetup.svelte'
import GuideParagraph from '../../components/shared/guideParagraph.svelte'
import GuideScreenshot from '../../components/shared/guideScreenshot.svelte'
import GuideTextHeader from '../../components/shared/guideTextHeader.svelte'
import GuideReadinessCompleteSummary from './guideReadinessCompleteSummary.svelte'
import GuideReadinessPanel from './guideReadinessPanel.svelte'

type Props = {
  configured: boolean
  editorIcon?: string
  editorLabel?: string
  newFileShortcut?: string
  onComplete: () => void
  onReset: () => void
  operatingSystem?: string
  terminalProjectPath: string
}

let {
  configured,
  editorIcon,
  editorLabel,
  newFileShortcut,
  onComplete,
  onReset,
  operatingSystem,
  terminalProjectPath,
}: Props = $props()
let expanded = $state(false)
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
      class="mt-0.5 size-5 shrink-0 text-[#b42318] dark:text-[#ef8b88]"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <p
        id="mapbox-account-readiness-title"
        class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#b42318] uppercase dark:text-[#ffb4b1]"
      >
        {@html m.guide_renderer_mapbox_account_eyebrow()}
      </p>
      <GuideTextHeader
        as="h3"
        title={m.guide_renderer_mapbox_account_title()}
        class="mt-2 text-headline-sm"
      />
      <GuideParagraph class="mt-3">
        {@html m.guide_renderer_mapbox_account_description()}
      </GuideParagraph>
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
  <GuideParagraph class="mt-5">
    {@html m.guide_renderer_mapbox_account_copy_token()}
  </GuideParagraph>
  <GuideEnvironmentFileSetup
    class="mt-8"
    title={m.guide_renderer_mapbox_env_file_title()}
    description={m.guide_renderer_mapbox_env_file_description()}
    {editorIcon}
    {editorLabel}
    environmentFileCode="VITE_MAPBOX_TOKEN=PASTE_YOUR_MAPBOX_TOKEN_HERE"
    {newFileShortcut}
    {operatingSystem}
    {terminalProjectPath}
  />
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
        class="bg-secondary text-on-secondary hover:bg-secondary/85"
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
