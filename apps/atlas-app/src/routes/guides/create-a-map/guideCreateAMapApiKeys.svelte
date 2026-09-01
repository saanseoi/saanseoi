<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { Button } from '#lib/bits/primitives/button/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import GuideCodeBlock from '#lib/bits/pages/guides/components/shared/guideCodeBlock.svelte'
import GuideCallout from '#lib/bits/pages/guides/components/shared/guideCallout.svelte'
import GuideLayout from '#lib/bits/pages/guides/components/shared/guideLayout.svelte'
import GuideParagraph from '#lib/bits/pages/guides/components/shared/guideParagraph.svelte'
import GuideScreenshot from '#lib/bits/pages/guides/components/shared/guideScreenshot.svelte'
import GuideTextHeader from '#lib/bits/pages/guides/components/shared/guideTextHeader.svelte'
import GuideTextSubHeader from '#lib/bits/pages/guides/components/shared/guideTextSubHeader.svelte'
import macosEnvFile from '#lib/assets/guides/macos_sublimetext_env.jpg'

import { createGuideApiKey } from './createAMapApiKeys.remote'

type Props = {
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
  terminalProjectPath?: string
  usingExistingKey?: boolean
}

let {
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
  !isApiKeyReady && (usingExistingKey || Boolean(newKey)),
)
const environmentFileCode = $derived(
  `VITE_SAANSEOI_API_KEY=${newKey ?? 'REPLACE_ME_WITH_YOUR_API_KEY'}`,
)
const environmentFileStructureCommand = $derived(
  operatingSystem === 'windows' ? 'Get-ChildItem -Force' : 'ls -la',
)
const environmentFileStructureLabel = $derived(
  m.guide_setup_terminal_label({
    action: m.guide_basemap_env_file_structure_title(),
    path:
      terminalProjectPath ??
      (operatingSystem === 'windows'
        ? 'C:\\Users\\your-name\\saanseoi-project'
        : '~/saanseoi-project'),
  }),
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
        '-a---                vite.config.js',
        '-a---                vite.config.ts',
      ].join('\n')
    : [
        'total 72',
        'drwxr-xr-x@ 11 saan seoi    352 Aug 26 21:28 .',
        'drwxr-x---@ 66 saan seoi   2112 Aug 26 21:33 ..',
        '-rw-r--r--   1 saan seoi     68 Aug 26 21:30 .env',
        '-rw-r--r--@  1 saan seoi    253 Aug 26 20:52 .gitignore',
        '-rw-r--r--@  1 saan seoi  15617 Aug 26 21:03 bun.lock',
        '-rw-r--r--@  1 saan seoi    366 Aug 26 20:52 index.html',
        'drwxr-xr-x@ 36 saan seoi   1152 Aug 26 21:03 node_modules',
        '-rw-r--r--@  1 saan seoi    327 Aug 26 21:03 package.json',
        'drwxr-xr-x@  4 saan seoi    128 Aug 26 20:52 public',
        'drwxr-xr-x@  6 saan seoi    192 Aug 26 20:52 src',
        '-rw-r--r--@  1 saan seoi    560 Aug 26 20:52 tsconfig.json',
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
</script>

<GuideLayout
  width="content"
  class={`mt-8 min-w-0 ${isApiKeyReady ? 'max-w-[48rem]' : ''}`}
>
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
      <button
        aria-controls="guide-api-key-options"
        aria-expanded={apiKeyOptionsExpanded}
        class="mt-5 flex w-full cursor-pointer items-center justify-between gap-4 border-l-4 border-secondary bg-secondary/10 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary dark:border-[#6fdec9] dark:bg-[#6fdec9]/12 dark:focus-visible:outline-[#6fdec9]"
        onclick={() => (apiKeyOptionsExpanded = !apiKeyOptionsExpanded)}
        type="button"
      >
        <div class="min-w-0">
          <p
            class="font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase dark:text-[#6fdec9]"
          >
            {m.guide_basemap_api_key_complete_eyebrow()}
          </p>
          <p class="mt-1 font-body text-body-md font-semibold text-primary">
            {m.guide_basemap_api_key_complete_title()}
          </p>
        </div>
        <Icon
          aria-label={m.guide_basemap_api_key_complete()}
          class="size-5 shrink-0 text-secondary dark:text-[#6fdec9]"
          icon="ion:checkmark-circle"
        />
      </button>
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
            {#if !isApiKeyReady}
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
      <div class="mt-8 border-t border-border-card pt-8">
        <GuideTextHeader
          as="h4"
          title={m.guide_basemap_env_file_title()}
          class="text-headline-sm"
        />
        <GuideParagraph
          class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-border-card [&_kbd]:bg-surface-container-low [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[0.85em]"
        >
          {@html editorLabel && newFileShortcut
          ? (environmentFileExists
              ? m.guide_basemap_env_file_editor_existing_instruction({ editor: editorLabel })
              : m.guide_basemap_env_file_editor_instruction({
              editor: editorLabel,
              shortcut: newFileShortcut,
            }))
          : (environmentFileExists
              ? m.guide_basemap_env_file_other_existing_instruction()
              : m.guide_basemap_env_file_other_instruction())}
        </GuideParagraph>
        {#if editorLabel === 'Sublime Text'}
          <GuideCallout class="mt-4">
            <div class="flex items-start gap-3">
              <Icon
                icon="material-symbols-light:warning-rounded"
                class="mt-0.5 size-5 shrink-0 text-[#f2c26d]"
                aria-hidden="true"
              />
              <p>{@html m.guide_basemap_env_file_sublime_location_note()}</p>
            </div>
          </GuideCallout>
          <div class="mt-5 max-w-2xl">
            <GuideScreenshot
              src={macosEnvFile}
              alt={m.guide_basemap_env_file_sublime_location_image_alt()}
            />
          </div>
          <GuideParagraph class="mt-3">
            {m.guide_basemap_env_file_sublime_hidden_file_note()}
          </GuideParagraph>
        {/if}
        {#if editorLabel === 'Zed'}
          <div class="mt-5 max-w-2xl">
            <GuideScreenshot
              src={macosEnvFile}
              alt={m.guide_basemap_env_file_zed_location_image_alt()}
            />
          </div>
        {/if}
        <GuideParagraph
          class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
        >
          {@html m.guide_basemap_env_file_description()}
        </GuideParagraph>
        <div class="mt-5">
          <GuideCodeBlock
            label=".env"
            pathPrefix={operatingSystem === 'windows' ? terminalProjectPath : undefined}
            code={environmentFileCode}
            {editorIcon}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            language="text"
            variant="editor"
          />
        </div>
        <div class="mt-8">
          <GuideTextSubHeader title={m.guide_basemap_env_file_structure_title()} />
          <GuideParagraph
            class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
          >
            {@html operatingSystem === 'windows'
            ? m.guide_basemap_env_file_structure_description_windows()
            : m.guide_basemap_env_file_structure_description()}
          </GuideParagraph>
          <div class="mt-5">
            <GuideCodeBlock
              label={environmentFileStructureLabel}
              code={environmentFileStructureCommand}
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
            />
          </div>
          <div class="mt-5">
            <GuideCodeBlock
              label={m.guide_setup_complete_output()}
              code={environmentFileStructureCode}
              copyable={false}
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              language="text"
            />
          </div>
        </div>
      </div>
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
