<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { Button } from '#lib/bits/primitives/button/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import GuideCodeBlock from '#lib/bits/pages/guides/components/shared/guideCodeBlock.svelte'

import { createGuideApiKey } from './createAMapApiKeys.remote'

type Props = {
  apiKeyReady?: boolean
  editorIcon?: string
  editorLabel?: string
  newFileShortcut?: string
  operatingSystem?: string
  onApiKeyCreated?: (key: string) => void
  onApiKeyReadyChange?: (ready: boolean) => void
  showHeading?: boolean
}

let {
  apiKeyReady = false,
  editorIcon,
  editorLabel,
  newFileShortcut,
  operatingSystem,
  onApiKeyCreated,
  onApiKeyReadyChange,
  showHeading = true,
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
const environmentSetupVisible = $derived(isApiKeyReady || Boolean(newKey))
const environmentFileCode = $derived(
  `VITE_SAANSEOI_API_KEY=${newKey ?? 'REPLACE_ME_WITH_YOUR_API_KEY'}`,
)
const environmentFileStructureCode = $derived(
  operatingSystem === 'windows'
    ? [
        'PS> Get-ChildItem -Force',
        '',
        'Mode  LastWriteTime  Length  Name',
        'd----                 node_modules',
        'd----                 src',
        '-a---                .env',
        '-a---                index.html',
        '-a---                package.json',
        '-a---                tsconfig.json',
        '-a---                vite.config.ts',
      ].join('\n')
    : [
        '$ ls -la',
        'total 212',
        'drwxr-xr-x  4 you you  4096 .',
        'drwxr-xr-x  1 you you  4096 ..',
        '-rw-r--r--  1 you you    48 .env',
        '-rw-r--r--  1 you you   324 index.html',
        'drwxr-xr-x 68 you you  4096 node_modules',
        '-rw-r--r--  1 you you   581 package.json',
        'drwxr-xr-x  2 you you  4096 src',
        '-rw-r--r--  1 you you   614 tsconfig.json',
        '-rw-r--r--  1 you you   302 vite.config.ts',
      ].join('\n'),
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
}

const completeApiKeyConfirmation = () => {
  hasConfirmedApiKey = true
  apiKeyOptionsExpanded = false
}

$effect(() => {
  onApiKeyReadyChange?.(isApiKeyReady)
})
</script>

<section
  id="basemap-api-key-readiness"
  class="mt-8 min-w-0 max-w-3xl"
  aria-labelledby="guide-api-keys-title"
>
  {#if showHeading}
    <h3
      id="guide-api-keys-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.api_keys_title()}
    </h3>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      {m.api_keys_description()}
    </p>
  {/if}

  {#if isApiKeyReady}
    <button
      aria-controls="guide-api-key-options"
      aria-expanded={apiKeyOptionsExpanded}
      class="mt-5 flex w-full cursor-pointer items-center justify-between gap-4 border-l-4 border-[#149b75] bg-[#e2f5ed] px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#08745b] dark:border-[#6fdec9] dark:bg-[#6fdec9]/12 dark:focus-visible:outline-[#6fdec9]"
      onclick={() => (apiKeyOptionsExpanded = !apiKeyOptionsExpanded)}
      type="button"
    >
      <div class="min-w-0">
        <p
          class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#08745b] uppercase dark:text-[#6fdec9]"
        >
          {m.guide_basemap_api_key_complete_eyebrow()}
        </p>
        <p class="mt-1 font-body text-body-md font-semibold text-primary">
          {m.guide_basemap_api_key_complete_title()}
        </p>
      </div>
      <Icon
        aria-label={m.guide_basemap_api_key_complete()}
        class="size-5 shrink-0 text-[#08745b] dark:text-[#6fdec9]"
        icon="ion:checkmark-circle"
      />
    </button>
  {/if}

  {#if !isApiKeyReady || apiKeyOptionsExpanded}
    {#if !newKey}
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
            placeholder={m.api_keys_name_placeholder()}
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
          {#if isApiKeyReady}
            <Button
              class="w-full whitespace-nowrap md:w-auto"
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
          {:else}
            <Button
              class="w-full whitespace-nowrap md:w-auto"
              onclick={() => (hasConfirmedApiKey = true)}
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

    {#if newKey}
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
  {/if}

  {#if environmentSetupVisible}
    <div class="mt-8 border-t border-border-card pt-8">
      <h4 class="font-display text-headline-sm font-bold text-primary">
        {m.guide_basemap_env_file_title()}
      </h4>
      <p
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-border-card [&_kbd]:bg-surface-container-low [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[0.85em]"
      >
        {@html editorLabel && newFileShortcut
          ? m.guide_basemap_env_file_editor_instruction({
              editor: editorLabel,
              shortcut: newFileShortcut,
            })
          : m.guide_basemap_env_file_other_instruction()}
      </p>
      <p
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
      >
        {@html m.guide_basemap_env_file_description()}
      </p>
      <div class="mt-5">
        <GuideCodeBlock
          label=".env"
          code={environmentFileCode}
          {editorIcon}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          language="text"
          variant="editor"
        />
      </div>
      <div class="mt-8">
        <h5 class="font-body text-body-md font-semibold text-foreground">
          {m.guide_basemap_env_file_structure_title()}
        </h5>
        <p
          class="mt-3 font-body text-body-md leading-7 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
        >
          {@html operatingSystem === 'windows'
            ? m.guide_basemap_env_file_structure_description_windows()
            : m.guide_basemap_env_file_structure_description()}
        </p>
        <div class="mt-5">
          <GuideCodeBlock
            label={m.guide_basemap_env_file_structure_label()}
            code={environmentFileStructureCode}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            language="text"
          />
        </div>
      </div>
    </div>
  {/if}

  {#if newKey && !isApiKeyReady}
    <div class="mt-6 flex max-w-3xl justify-end">
      <Button
        class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
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
