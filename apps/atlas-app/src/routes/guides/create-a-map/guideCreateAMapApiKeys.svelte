<script lang="ts">
import Icon from '@iconify/svelte'

import { Button, GuideCodeBlock } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'

import { createGuideApiKey } from './createAMapApiKeys.remote'

let name = $state('')
let error = $state<string>()
let newKey = $state<string>()
let isNewKeyRevealed = $state(false)
let copied = $state(false)
const saveApiKeyCommand =
  'bun -e \'import { createInterface } from "node:readline/promises"; const rl=createInterface({input:process.stdin,output:process.stdout}); const key=await rl.question("Paste your SaanSeoi public key: "); rl.close(); await Bun.write(".env","VITE_SAANSEOI_API_KEY="+key.trim()+"\\n")\''

const createKey = async () => {
  error = undefined
  try {
    const result = await createGuideApiKey({ name })
    newKey = result.rawKey
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
</script>

<section class="mt-8 max-w-3xl" aria-labelledby="guide-api-keys-title">
  <h3
    id="guide-api-keys-title"
    class="font-display text-headline-sm font-bold text-primary"
  >
    {m.api_keys_title()}
  </h3>
  <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
    {m.api_keys_description()}
  </p>

  <div class="mt-6 border border-border-card bg-surface-container-low p-5">
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
      <Button disabled={createGuideApiKey.pending > 0} type="submit" variant="primary">
        {createGuideApiKey.pending > 0
          ? m.api_keys_creating()
          : m.api_keys_create_button()}
      </Button>
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
        <p class="mt-3 font-body text-body-sm leading-6 text-foreground-alt">
          {m.guide_basemap_api_key_env_description()}
        </p>
      </div>
    </div>
  {/if}
</section>
