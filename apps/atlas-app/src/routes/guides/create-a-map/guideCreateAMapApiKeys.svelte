<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { Button } from '#lib/bits/primitives/button/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import GuideEnvironmentFileSetup from '#lib/bits/pages/guides/components/shared/guideEnvironmentFileSetup.svelte'
import GuideLayout from '#lib/bits/pages/guides/components/shared/guideLayout.svelte'
import GuideParagraph from '#lib/bits/pages/guides/components/shared/guideParagraph.svelte'
import GuideTextHeader from '#lib/bits/pages/guides/components/shared/guideTextHeader.svelte'
import GuideReadinessCompleteSummary from '#lib/bits/pages/guides/components/createAMap/guideReadinessCompleteSummary.svelte'
import GuideReadinessPanel from '#lib/bits/pages/guides/components/createAMap/guideReadinessPanel.svelte'

import { createGuideApiKey } from './createAMapApiKeys.remote'

type Props = {
  allowExistingKey?: boolean
  apiKeyReady?: boolean
  editorIcon?: string
  editorLabel?: string
  environmentFileExists?: boolean
  newFileShortcut?: string
  operatingSystem?: string
  onApiKeyCreated?: (key: string) => void
  onApiKeyConfirmed?: () => void
  onApiKeyReadyChange?: (ready: boolean) => void
  showHeading?: boolean
  showEnvironmentSetup?: boolean
  terminalProjectPath?: string
  usingExistingKey?: boolean
}

let {
  allowExistingKey = true,
  apiKeyReady = false,
  editorIcon,
  editorLabel,
  environmentFileExists = false,
  newFileShortcut,
  operatingSystem,
  onApiKeyCreated,
  onApiKeyConfirmed,
  onApiKeyReadyChange,
  showHeading = true,
  showEnvironmentSetup = true,
  terminalProjectPath,
  usingExistingKey = $bindable(false),
}: Props = $props()
let hasConfirmedApiKey = $state<boolean>()
let isApiKeyReady = $derived(hasConfirmedApiKey ?? apiKeyReady)
let apiKeyOptionsExpanded = $state(false)
let name = $state('')
let error = $state<string>()
let newKey = $state<string>()
let newKeyName = $state<string>()
let isNewKeyRevealed = $state(false)
let copied = $state(false)
const environmentSetupVisible = $derived(
  showEnvironmentSetup && !isApiKeyReady && (usingExistingKey || Boolean(newKey)),
)
const environmentFileCode = $derived(
  `VITE_SAANSEOI_API_KEY=${newKey ?? 'REPLACE_ME_WITH_YOUR_API_KEY'}`,
)

const createKey = async () => {
  error = undefined
  try {
    const result = await createGuideApiKey({ name })
    newKey = result.rawKey
    onApiKeyCreated?.(result.rawKey)
    newKeyName = name.trim()
    isNewKeyRevealed = false
    copied = false
    name = ''
  } catch (exception) {
    error = exception instanceof Error ? exception.message : m.api_keys_create_error()
  }
}

const copyNewKey = async () => {
  if (!newKey) return

  try {
    await navigator.clipboard.writeText(newKey)
    copied = true
    trackClientProductUsage({
      event: 'api_key.copy',
      surface: 'guide',
      entityType: 'key_action',
      entityId: 'copy',
    })
  } catch {
    trackClientProductUsage({
      event: 'api_key.copy',
      surface: 'guide',
      entityType: 'key_action',
      entityId: 'copy',
      outcome: 'failure',
    })
  }
}

const resetApiKeyConfirmation = () => {
  hasConfirmedApiKey = false
  apiKeyOptionsExpanded = false
  usingExistingKey = false
  newKey = undefined
  newKeyName = undefined
  isNewKeyRevealed = false
  copied = false
}

const completeApiKeyConfirmation = () => {
  hasConfirmedApiKey = true
  apiKeyOptionsExpanded = false
  usingExistingKey = false
  onApiKeyConfirmed?.()
}

$effect(() => {
  onApiKeyReadyChange?.(isApiKeyReady)
})

$effect(() => {
  if (!allowExistingKey && usingExistingKey) usingExistingKey = false
})
</script>

<GuideLayout width="content" class={`mt-8 min-w-0 ${isApiKeyReady ? 'max-w-3xl' : ''}`}>
  <section id="basemap-api-key-readiness" aria-labelledby="guide-api-keys-title">
    {#if showHeading}
      <GuideTextHeader
        as="h3"
        id="guide-api-keys-title"
        title={m.api_keys_title()}
        class="text-headline-sm"
      />
      <GuideParagraph class="mt-3">
        {m.api_keys_description()}
      </GuideParagraph>
    {/if}

    {#if isApiKeyReady}
      <GuideReadinessPanel
        id="guide-api-key-readiness"
        complete
        bind:expanded={apiKeyOptionsExpanded}
        titleId="guide-api-key-readiness-title"
      >
        <button
          aria-controls="guide-api-key-options"
          aria-expanded={apiKeyOptionsExpanded}
          class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
          onclick={() => (apiKeyOptionsExpanded = !apiKeyOptionsExpanded)}
          type="button"
        >
          <GuideReadinessCompleteSummary
            titleId="guide-api-key-readiness-title"
            eyebrow={m.guide_basemap_api_key_complete_eyebrow()}
            description={m.guide_basemap_api_key_complete_title()}
          />
        </button>
      </GuideReadinessPanel>
    {/if}

    {#if (!isApiKeyReady && !usingExistingKey) || apiKeyOptionsExpanded}
      {#if !newKey && !isApiKeyReady}
        <div
          id="guide-api-key-options"
          class="mt-6 min-w-0 max-w-full border border-border-card bg-surface-container-low p-5"
        >
          <h4 class="font-body text-body-md font-semibold text-foreground">
            {m.api_keys_create_heading()}
          </h4>
          <form
            class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"
            onsubmit={event => {
          event.preventDefault()
          createKey()
        }}
          >
            <input
              bind:value={name}
              class="col-span-2 min-h-12 min-w-0 border border-border-input bg-background-alt px-4 font-body text-foreground md:col-span-1"
              maxlength="64"
              placeholder={m.guide_basemap_api_key_name_placeholder()}
              required
            >
            <Button
              class="w-full whitespace-nowrap md:w-auto"
              disabled={createGuideApiKey.pending > 0}
              type="submit"
              variant="primary"
            >
              {createGuideApiKey.pending > 0
            ? m.api_keys_creating()
            : m.api_keys_create_button()}
            </Button>
            {#if allowExistingKey && !isApiKeyReady}
              <Button
                class="w-full whitespace-nowrap md:w-auto"
                onclick={() => (usingExistingKey = true)}
                type="button"
                variant="secondary"
              >
                {m.guide_basemap_api_key_already_have()}
              </Button>
            {/if}
          </form>
          {#if error}
            <p class="mt-3 font-body text-body-sm text-destructive" role="alert">
              {error}
            </p>
          {/if}
        </div>
      {/if}

      {#if newKey && !isApiKeyReady}
        <div
          class="mt-6 border border-secondary bg-secondary-container/20 p-5"
          role="status"
        >
          <p class="font-body text-body-md font-semibold text-foreground">
            {m.api_keys_store_title({ name: newKeyName ?? '' })}
          </p>
          <p class="mt-2 font-body text-body-sm leading-6 text-foreground-alt">
            {m.api_keys_store_description()}
          </p>
          <div
            class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
          >
            <code
              class="flex h-12 min-h-12 w-full min-w-0 items-center overflow-x-auto border border-border-card bg-background-alt px-4 font-mono text-sm text-foreground"
              >{isNewKeyRevealed ? newKey : '••••••••••••••••••••••••••••••••'}</code
            >
            <div class="grid grid-cols-2 gap-3 sm:contents">
              <Button
                class="h-12 w-full sm:w-auto"
                onclick={() => {
              isNewKeyRevealed = !isNewKeyRevealed
              trackClientProductUsage({ event: 'api_key.reveal', surface: 'guide', entityType: 'key_action', entityId: isNewKeyRevealed ? 'reveal' : 'hide' })
            }}
                size="compact"
                variant="secondary"
              >
                <Icon
                  icon={isNewKeyRevealed ? 'ion:eye-off-outline' : 'ion:eye-outline'}
                  class="size-4"
                />
                {isNewKeyRevealed ? m.api_keys_hide() : m.api_keys_reveal()}
              </Button>
              <Button
                class="h-12 w-full sm:w-auto"
                onclick={copyNewKey}
                size="compact"
                variant="primary"
              >
                <Icon
                  icon={copied ? 'ion:checkmark' : 'ion:copy-outline'}
                  class="size-4"
                />
                {copied ? m.api_keys_copied() : m.api_keys_copy()}
              </Button>
            </div>
          </div>
        </div>
      {/if}

      {#if isApiKeyReady}
        <div
          id="guide-api-key-options"
          class="mt-6 border border-border-card bg-surface-container-low p-5"
        >
          <p
            class="font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-background-alt [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
          >
            {@html m.guide_basemap_api_key_assumed_env()}
          </p>
        </div>
        <div class="mt-6 flex max-w-3xl justify-end">
          <Button
            onclick={resetApiKeyConfirmation}
            size="compact"
            type="button"
            variant="secondary"
          >
            <Icon
              aria-hidden="true"
              class="size-5"
              icon="material-symbols-light:restart-alt-rounded"
            />
            {@html m.guide_readiness_reset()}
          </Button>
        </div>
      {/if}
    {/if}

    {#if environmentSetupVisible}
      <GuideEnvironmentFileSetup
        class="mt-8"
        description={m.guide_basemap_env_file_description()}
        {editorIcon}
        {editorLabel}
        {environmentFileCode}
        {environmentFileExists}
        {newFileShortcut}
        {operatingSystem}
        {terminalProjectPath}
        title={m.guide_basemap_env_file_title()}
      />
    {/if}

    {#if environmentSetupVisible && !isApiKeyReady}
      <div class="mt-6 flex max-w-3xl justify-end">
        <Button
          class="bg-secondary text-on-secondary hover:bg-secondary/85"
          onclick={completeApiKeyConfirmation}
          size="compact"
        >
          <Icon
            aria-hidden="true"
            class="size-5"
            icon="material-symbols-light:check-rounded"
          />
          {m.guide_basemap_api_key_confirm()}
        </Button>
      </div>
    {/if}
  </section>
</GuideLayout>
