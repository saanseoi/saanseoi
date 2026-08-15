<script lang="ts">
import Icon from '@iconify/svelte'

import { Button, GuideCodeBlock } from '#lib/bits/index.js'
import { m } from '#lib/bits/internal/i18n.js'

import { createGuideApiKey } from './createAMapApiKeys.remote'

type Props = {
  apiKeyReady?: boolean
  onApiKeyReadyChange?: (ready: boolean) => void
  showHeading?: boolean
}

let { apiKeyReady = false, onApiKeyReadyChange, showHeading = true }: Props = $props()
let hasConfirmedApiKey = $state<boolean>()
let isApiKeyReady = $derived(hasConfirmedApiKey ?? apiKeyReady)
let apiKeyOptionsExpanded = $state(false)
let name = $state('')
let error = $state<string>()
let newKey = $state<string>()
let newKeyName = $state<string>()
let isNewKeyRevealed = $state(false)
let copied = $state(false)
const saveApiKeyCommand =
  'bun -e \'import { createInterface } from "node:readline/promises"; const rl=createInterface({input:process.stdin,output:process.stdout}); const key=(await rl.question("Paste your SaanSeoi public key: ")).trim(); rl.close(); const path=".env"; const current=await Bun.file(path).text().catch(()=>""); const line="VITE_SAANSEOI_API_KEY="+key; const next=/^VITE_SAANSEOI_API_KEY=.*$/m.test(current)?current.replace(/^VITE_SAANSEOI_API_KEY=.*$/m,line):current+(current&&!current.endsWith("\\n")?"\\n":"")+line+"\\n"; await Bun.write(path,next)\''
const verifyApiKeyCommand = 'cat .env'

const createKey = async () => {
  error = undefined
  try {
    const result = await createGuideApiKey({ name })
    newKey = result.rawKey
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

  await navigator.clipboard.writeText(newKey)
  copied = true
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
  class="mt-8 max-w-3xl"
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
      class="mt-5 flex w-full cursor-pointer items-center justify-between gap-4 border-l-4 border-[#6fdec9] bg-[#6fdec9]/12 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6fdec9]"
      onclick={() => (apiKeyOptionsExpanded = !apiKeyOptionsExpanded)}
      type="button"
    >
      <div>
        <p
          class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#6fdec9] uppercase"
        >
          {m.guide_basemap_api_key_complete_eyebrow()}
        </p>
        <p class="mt-1 font-body text-body-md font-semibold text-primary">
          {m.guide_basemap_api_key_complete_title()}
        </p>
      </div>
      <Icon
        aria-label={m.guide_basemap_api_key_complete()}
        class="size-5 shrink-0 text-[#6fdec9]"
        icon="ion:checkmark-circle"
      />
    </button>
  {/if}

  {#if !isApiKeyReady || apiKeyOptionsExpanded}
    <div
      id="guide-api-key-options"
      class="mt-6 border border-border-card bg-surface-container-low p-5"
    >
      <h4 class="font-body text-body-md font-semibold text-foreground">
        {m.api_keys_create_heading()}
      </h4>
      <form
        class="mt-4 flex flex-col gap-3 sm:flex-row"
        onsubmit={event => {
        event.preventDefault()
        createKey()
      }}
      >
        <input
          bind:value={name}
          class="min-h-12 flex-1 border border-border-input bg-background-alt px-4 font-body text-foreground"
          maxlength="64"
          placeholder={m.api_keys_name_placeholder()}
          required
        >
        <Button
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
            onclick={() => (hasConfirmedApiKey = true)}
            type="button"
            variant="secondary"
          >
            {m.guide_basemap_api_key_already_have()}
          </Button>
        {/if}
      </form>
      {#if error}
        <p class="mt-3 font-body text-body-sm text-destructive" role="alert">{error}</p>
      {/if}
    </div>

    {#if newKey}
      <div
        class="mt-5 border border-secondary bg-secondary-container/20 p-5"
        role="status"
      >
        <p class="font-body text-body-md font-semibold text-foreground">
          {m.api_keys_store_title()}
        </p>
        <p class="mt-2 font-body text-body-sm leading-6 text-foreground-alt">
          {m.api_keys_store_description()}
        </p>
        <p class="mt-2 font-body text-body-sm leading-6 text-foreground-alt">
          {m.api_keys_name_label()}
          <strong class="font-semibold text-foreground">{newKeyName}</strong>
        </p>
        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code
            class="min-w-0 flex-1 overflow-x-auto border border-border-card bg-background-alt px-4 py-3 font-mono text-sm text-foreground"
            >{isNewKeyRevealed ? newKey : '••••••••••••••••••••••••••••••••'}</code
          >
          <Button
            onclick={() => (isNewKeyRevealed = !isNewKeyRevealed)}
            size="compact"
            variant="secondary"
          >
            <Icon
              icon={isNewKeyRevealed ? 'ion:eye-off-outline' : 'ion:eye-outline'}
              class="size-4"
            />
            {isNewKeyRevealed ? m.api_keys_hide() : m.api_keys_reveal()}
          </Button>
          <Button onclick={copyNewKey} size="compact" variant="primary">
            <Icon icon={copied ? 'ion:checkmark' : 'ion:copy-outline'} class="size-4" />
            {copied ? m.api_keys_copied() : m.api_keys_copy()}
          </Button>
        </div>
        <div class="mt-6">
          <GuideCodeBlock
            code={saveApiKeyCommand}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            label={m.guide_basemap_api_key_env_title()}
            language="bash"
          />
          <p
            class="mt-3 font-body text-body-sm leading-6 tracking-[0.01em] text-foreground-alt"
          >
            {m.guide_basemap_api_key_env_description_before()}
            <strong class="font-semibold text-foreground">VITE_SAANSEOI_API_KEY</strong>
            {@html m.guide_basemap_api_key_env_description_after()}
          </p>
        </div>
        <div class="mt-6">
          <GuideCodeBlock
            code={verifyApiKeyCommand}
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            label={m.guide_basemap_api_key_verify_title()}
            language="bash"
          />
          <p
            class="mt-3 font-body text-body-sm leading-6 tracking-[0.01em] text-foreground-alt"
          >
            {@html m.guide_basemap_api_key_verify_description()}
          </p>
        </div>
        <div class="mt-6 flex justify-end">
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
      </div>
    {/if}
  {/if}
</section>
