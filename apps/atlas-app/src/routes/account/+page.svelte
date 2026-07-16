<script lang="ts">
import { Button, Main } from '$lib/bits'
import { authClient } from '$lib/auth-client'
import { getCurrentLocale } from '$lib/bits/internal/i18n'
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import {
  addPasswordForCurrentUser,
  changePasswordForCurrentUser,
  getAccountPageData,
  unlinkAccountForCurrentUser,
} from './account.remote'

let data = $derived(await getAccountPageData())
let accounts = $state<typeof data.accounts>([])
let error = $state<string | null>(null)
let unlinkingAccountId = $state<string | null>(null)
let password = $state('')
let currentPassword = $state('')
let passwordMessage = $state<string | null>(null)
let passwordDialogOpen = $state(false)
let passwordDialogMode = $state<'add' | 'change'>('add')
const providers = [
  { id: 'google', label: 'Google', icon: 'ion:logo-google' },
  { id: 'github', label: 'GitHub', icon: 'ion:logo-github' },
]
const linked = (provider: string) =>
  accounts.some(account => account.providerId === provider)

$effect(() => {
  accounts = data.accounts
})

const link = async (provider: 'google' | 'github') => {
  await authClient.linkSocial({ provider, callbackURL: '/account' })
}

const unlink = async (providerId: string, accountId: string) => {
  if (unlinkingAccountId) return
  error = null
  unlinkingAccountId = accountId
  try {
    const result = await unlinkAccountForCurrentUser({
      providerId,
      accountId,
      locale: getCurrentLocale(),
    })
    if (!result.ok) error = result.message
  } finally {
    unlinkingAccountId = null
  }
}

const addPassword = async () => {
  passwordMessage = null
  const result = await addPasswordForCurrentUser({
    password,
    locale: getCurrentLocale(),
  })
  passwordMessage = result.message
  if (result.ok) {
    password = ''
    passwordDialogOpen = false
  }
}

const changePassword = async () => {
  passwordMessage = null
  const result = await changePasswordForCurrentUser({
    currentPassword,
    newPassword: password,
    locale: getCurrentLocale(),
  })
  passwordMessage = result.message
  if (result.ok) {
    currentPassword = ''
    password = ''
  }
}

const providerDetails = (providerId: string) =>
  providerId === 'credential'
    ? { label: 'Email and password', icon: 'ion:mail-outline' }
    : (providers.find(provider => provider.id === providerId) ?? {
        label: providerId,
        icon: 'ion:lock-closed-outline',
      })
</script>

<svelte:head><title>Account | Saanseoi</title></svelte:head>
<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
  ><p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    Developer account
  </p>
  <h1
    class="mt-3 font-display text-headline-lg font-bold text-primary md:text-display-md"
  >
    Account settings
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">{data.user.email}</p>
  <div class="mt-8 flex gap-3">
    <Button href="/api-keys" variant="primary">Manage API keys</Button>
    <form action="/logout" method="POST">
      <Button type="submit" variant="secondary">Sign out</Button>
    </form>
  </div>
  <section class="mt-14 max-w-3xl">
    <h2 class="font-display text-headline-sm font-bold text-primary">
      Sign-in methods
    </h2>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      Link a second method before removing one. Your final sign-in method cannot be
      removed.
    </p>
    {#if error}
      <p class="mt-4 font-body text-body-sm text-destructive">{error}</p>
    {/if}
    <div
      class="mt-6 divide-y divide-border-card border border-border-card bg-background-alt"
    >
      {#each accounts as account}
        {@const provider = providerDetails(account.providerId)}
        <article class="flex items-center justify-between gap-4 p-5">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
            >
              <Icon icon={provider.icon} class="size-5" />
            </div>
            <div>
              <p class="font-body font-semibold text-foreground">{provider.label}</p>
              <p class="mt-1 font-body text-sm text-foreground-alt">
                Connected sign-in method
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            {#if account.providerId === 'credential'}
              <Button
                onclick={() => { passwordDialogMode = 'change'; passwordDialogOpen = true }}
                size="compact"
                variant="secondary"
                >Change password</Button
              >
            {/if}
            <Button
              onclick={() => unlink(account.providerId, account.id)}
              disabled={unlinkingAccountId !== null}
              size="compact"
              variant="secondary"
              >{unlinkingAccountId === account.id ? 'Removing…' : 'Remove'}</Button
            >
          </div>
        </article>
      {/each}
      {#each providers as provider}
        {#if !linked(provider.id)}
          <article class="flex items-center justify-between gap-4 p-5">
            <div class="flex items-center gap-3">
              <div
                class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
              >
                <Icon icon={provider.icon} class="size-5" />
              </div>
              <div>
                <p class="font-body font-semibold text-foreground">{provider.label}</p>
                <p class="mt-1 font-body text-sm text-foreground-alt">Not connected</p>
              </div>
            </div>
            <Button
              onclick={() => link(provider.id as 'google' | 'github')}
              size="compact"
              variant="primary"
              >Connect</Button
            >
          </article>
        {/if}
      {/each}
      {#if !linked('credential')}
        <article class="flex items-center justify-between gap-4 p-5">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
            >
              <Icon icon="ion:mail-outline" class="size-5" />
            </div>
            <div>
              <p class="font-body font-semibold text-foreground">Email and password</p>
              <p class="mt-1 font-body text-sm text-foreground-alt">Not connected</p>
            </div>
          </div>
          <Button
            onclick={() => { passwordDialogMode = 'add'; passwordDialogOpen = true }}
            size="compact"
            variant="primary"
            >Add password</Button
          >
        </article>
      {/if}
    </div>
  </section>
</Main>

<Dialog.Root bind:open={passwordDialogOpen}>
  <Dialog.Portal
    ><Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border border-border-card bg-background-alt p-6 shadow-popover focus:outline-none"
      ><Dialog.Title class="font-display text-headline-sm font-bold text-primary"
        >{passwordDialogMode === 'add' ? 'Add email and password' : 'Change password'}</Dialog.Title
      ><Dialog.Description
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt"
        >{passwordDialogMode === 'add' ? 'Use your existing verified email address with a new password.' : 'Confirm your current password, then choose a new one.'}</Dialog.Description
      >
      <form
        class="mt-6"
        onsubmit={event => { event.preventDefault(); passwordDialogMode === 'add' ? addPassword() : changePassword() }}
      >
        {#if passwordDialogMode === 'change'}
          <label class="font-body text-sm font-semibold text-foreground"
            >Current password<input
              bind:value={currentPassword}
              class="mt-2 min-h-11 w-full border border-border-input bg-background-alt px-3 font-body font-normal"
              required
              type="password"
            ></label
          >
        {/if}
        <label class="font-body text-sm font-semibold text-foreground"
          >{passwordDialogMode === 'add' ? 'New password' : 'New password'}
          <input
            bind:value={password}
            class="mt-2 min-h-11 w-full border border-border-input bg-background-alt px-3 font-body font-normal"
            minlength="8"
            required
            type="password"
          ></label
        >
        {#if passwordMessage}
          <p class="mt-3 font-body text-sm text-destructive">{passwordMessage}</p>
        {/if}
        <div class="mt-6 flex justify-end gap-3">
          <Button onclick={() => (passwordDialogOpen = false)} variant="secondary"
            >Cancel</Button
          ><Button type="submit" variant="primary"
            >{passwordDialogMode === 'add' ? 'Add password' : 'Change password'}</Button
          >
        </div>
      </form></Dialog.Content
    ></Dialog.Portal
  >
</Dialog.Root>
