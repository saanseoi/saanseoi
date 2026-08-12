<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { Button, Main } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'

import {
  createApiKeyForCurrentUser,
  getApiKeysPageData,
  revokeApiKeyForCurrentUser,
} from './apiKeys.remote'

let loadedKeys = $derived(await getApiKeysPageData())
let keys = $state<typeof loadedKeys>([])
let name = $state('')
let revealedKey = $state<string | null>(null)
let keyRevealOpen = $state(false)
let copied = $state(false)
let showRevoked = $state(false)
let error = $state<string | null>(null)

$effect(() => {
  keys = loadedKeys
})

$effect(() => {
  if (!keyRevealOpen) {
    revealedKey = null
    copied = false
  }
})

const createKey = async () => {
  error = null
  try {
    const result = await createApiKeyForCurrentUser({ name })

    revealedKey = result.rawKey
    keyRevealOpen = true
    name = ''
  } catch (exception) {
    error = exception instanceof Error ? exception.message : m.api_keys_create_error()
    return
  }
}

const copyRevealedKey = async () => {
  if (!revealedKey) return

  await navigator.clipboard.writeText(revealedKey)
  copied = true
}

const revokeKey = async (id: string) => {
  if (!confirm(m.api_keys_revoke_confirmation())) return
  await revokeApiKeyForCurrentUser({ id })
}

const visibleKeys = $derived(keys.filter(key => showRevoked || !key.revokedAt))

const formatLastUsed = (lastUsedAt: Date | string | null) => {
  if (!lastUsedAt) return m.api_keys_not_used_yet()

  return new Intl.DateTimeFormat(getCurrentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(lastUsedAt))
}
</script>

<svelte:head><title>{m.api_keys_title()} | Saanseoi</title></svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <div class="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
    <div>
      <h1
        class="font-display text-headline-lg font-bold text-primary md:text-display-md"
      >
        {m.api_keys_title()}
      </h1>
      <p class="mt-3 max-w-2xl font-body text-body-lg leading-8 text-foreground-alt">
        {m.api_keys_description()}
      </p>
    </div>
    <Button href="/account" variant="secondary">
      {m.api_keys_account_settings()}
    </Button>
  </div>

  <section class="mt-10 border border-border-card bg-surface-container-low p-6 md:p-8">
    <h2 class="font-display text-headline-sm font-bold text-primary">
      {m.api_keys_create_heading()}
    </h2>
    <form
      class="mt-5 flex flex-col gap-3 sm:flex-row"
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
      ><Button
        disabled={createApiKeyForCurrentUser.pending > 0}
        type="submit"
        variant="primary"
        >{createApiKeyForCurrentUser.pending > 0
          ? m.api_keys_creating()
          : m.api_keys_create_button()}</Button
      >
    </form>
    {#if error}
      <p class="mt-3 font-body text-body-sm text-destructive">{error}</p>
    {/if}
  </section>

  <section class="mt-12">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-display text-headline-sm font-bold text-primary">
        {m.api_keys_your_keys()}
      </h2>
      <Button
        onclick={() => (showRevoked = !showRevoked)}
        size="compact"
        variant="text"
      >
        {showRevoked ? m.api_keys_hide_revoked() : m.api_keys_show_revoked()}
      </Button>
    </div>
    {#if visibleKeys.length === 0}
      <div
        class="mt-5 border border-dashed border-border-card bg-surface-container-low p-10 text-center"
      >
        <Icon icon="proicons:key" class="mx-auto size-8 text-secondary" />
        <p class="mt-4 font-body text-body-lg text-foreground">
          {keys.length === 0 ? m.api_keys_empty() : m.api_keys_no_active()}
        </p>
        <p class="mt-2 font-body text-body-md text-foreground-alt">
          {keys.length === 0
            ? m.api_keys_empty_description()
            : m.api_keys_no_active_description()}
        </p>
      </div>
    {:else}
      <div
        class="mt-5 divide-y divide-border-card border border-border-card bg-background-alt"
      >
        {#each visibleKeys as key}
          <article
            class="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p class="font-body font-semibold text-foreground">{key.name}</p>
              <p class="mt-1 font-mono text-sm text-foreground-alt">{key.prefix}</p>
              <p class="mt-2 font-body text-sm text-foreground-alt">
                {m.api_keys_last_used()}: {formatLastUsed(key.lastUsedAt)}
              </p>
              {#if key.revokedAt}
                <p class="mt-2 font-body text-sm text-destructive">
                  {m.api_keys_revoked()}
                </p>
              {/if}
            </div>
            {#if !key.revokedAt}
              <Button
                onclick={() => revokeKey(key.id)}
                size="compact"
                variant="secondary"
                >{m.api_keys_revoke()}</Button
              >
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</Main>

<Dialog.Root bind:open={keyRevealOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 border border-border-card bg-background-alt p-6 shadow-popover focus:outline-none md:p-8"
    >
      <div
        class="flex size-11 items-center justify-center bg-secondary-container text-secondary"
      >
        <Icon icon="proicons:key" class="size-5" />
      </div>
      <Dialog.Title class="mt-6 font-display text-headline-sm font-bold text-primary">
        {m.api_keys_store_title()}
      </Dialog.Title>
      <Dialog.Description
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt"
      >
        {m.api_keys_store_description()}
      </Dialog.Description>
      {#if revealedKey}
        <code
          class="mt-6 block overflow-x-auto border border-border-card bg-surface-container-low p-4 font-mono text-sm text-foreground"
          >{revealedKey}</code
        >
      {/if}
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button onclick={() => (keyRevealOpen = false)} variant="secondary"
          >{m.api_keys_stored_safely()}</Button
        >
        <Button onclick={copyRevealedKey} variant="primary"
          >{copied ? m.api_keys_copied() : m.api_keys_copy()}</Button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
