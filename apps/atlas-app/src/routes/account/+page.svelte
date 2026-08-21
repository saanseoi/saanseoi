<script lang="ts">
import { refreshAll } from '$app/navigation'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { authClient } from '#lib/auth-client.js'
import type { SocialProvider } from '#lib/auth-providers.js'
import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Dialog } from 'bits-ui'

import {
  addPasswordForCurrentUser,
  changePasswordForCurrentUser,
  deletePasskeyForCurrentUser,
  unlinkAccountForCurrentUser,
} from './account.remote'

let { data } = $props()
let accountPageData = $derived(data.accountPageData)
let accounts = $state<typeof accountPageData.accounts>([])
let passkeys = $state<typeof accountPageData.passkeys>([])
let error = $state<string | null>(null)
let unlinkingAccountId = $state<string | null>(null)
let removingPasskeyId = $state<string | null>(null)
let addingPasskey = $state(false)
let linkingProvider = $state<SocialProvider | null>(null)
let password = $state('')
let currentPassword = $state('')
let passwordMessage = $state<string | null>(null)
let passwordDialogOpen = $state(false)
let passwordDialogMode = $state<'add' | 'change'>('add')
const providers = [
  { id: 'google', label: 'Google', icon: 'ion:logo-google' },
  { id: 'facebook', label: 'Facebook', icon: 'ion:logo-facebook' },
  { id: 'github', label: 'GitHub', icon: 'ion:logo-github' },
]
const linked = (provider: string) =>
  accounts.some(account => account.providerId === provider)

const handleSignOut = async () => {
  const { error } = await authClient.signOut()
  if (error) return
  window.location.assign('/')
}

$effect(() => {
  accounts = accountPageData.accounts
  passkeys = accountPageData.passkeys
})

const link = async (provider: SocialProvider) => {
  if (linkingProvider) return
  error = null
  linkingProvider = provider
  try {
    const result = await authClient.linkSocial({ provider, callbackURL: '/account' })
    if (!result.error) return
    error = result.error.message ?? m.auth_sign_in_error()
  } catch {
    error = m.auth_sign_in_error()
  }

  linkingProvider = null
}

const addPasskey = async () => {
  if (addingPasskey) return
  error = null
  addingPasskey = true
  try {
    const result = await authClient.passkey.addPasskey()
    if (result.error) error = result.error.message ?? m.account_passkey_add_error()
    else await refreshAll()
  } catch {
    error = m.account_passkey_add_error()
  } finally {
    addingPasskey = false
  }
}

const removePasskey = async (id: string) => {
  if (removingPasskeyId) return
  error = null
  removingPasskeyId = id
  try {
    const result = await deletePasskeyForCurrentUser({
      id,
      locale: getCurrentLocale(),
    })
    if (!result.ok) error = result.message
    else await refreshAll()
  } finally {
    removingPasskeyId = null
  }
}

const unlink = async (accountId: string, providerId: string) => {
  if (unlinkingAccountId) return
  error = null
  unlinkingAccountId = accountId
  try {
    const result = await unlinkAccountForCurrentUser({
      accountId,
      providerId,
      locale: getCurrentLocale(),
    })
    if (!result.ok) error = result.message
    else await refreshAll()
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
    await refreshAll()
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
    ? { label: m.account_email_password(), icon: 'ion:mail-outline' }
    : (providers.find(provider => provider.id === providerId) ?? {
        label: providerId,
        icon: 'ion:lock-closed-outline',
      })
</script>

<Seo title={m.account_title()} description={m.account_methods_description()} noindex />
<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
  ><p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <h1
    class="mt-3 font-display text-headline-lg font-bold text-primary md:text-display-md"
  >
    {m.account_settings()}
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {accountPageData.user.email}
  </p>
  <div class="mt-8 flex gap-3">
    <Button href="/api-keys" variant="primary">{m.account_manage_api_keys()}</Button>
    <Button onclick={handleSignOut} variant="secondary">{m.account_sign_out()}</Button>
  </div>
  <section class="mt-14 max-w-3xl">
    <h2 class="font-display text-headline-sm font-bold text-primary">
      {m.account_sign_in_methods()}
    </h2>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      {m.account_methods_description()}
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
                {m.account_connected_method()}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            {#if account.providerId === 'credential'}
              <Button
                onclick={() => { passwordDialogMode = 'change'; passwordDialogOpen = true }}
                size="compact"
                variant="secondary"
                >{m.account_change_password()}</Button
              >
            {/if}
            {#if accounts.length + passkeys.length > 1}
              <Button
                onclick={() => unlink(account.id, account.providerId)}
                disabled={unlinkingAccountId !== null}
                size="compact"
                variant="secondary"
                >{unlinkingAccountId === account.id ? m.account_removing() : m.account_remove()}</Button
              >
            {/if}
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
                <p class="mt-1 font-body text-sm text-foreground-alt">
                  {m.account_not_connected()}
                </p>
              </div>
            </div>
            <Button
              aria-busy={linkingProvider === provider.id}
              disabled={linkingProvider !== null}
              onclick={() => link(provider.id as SocialProvider)}
              size="compact"
              variant="primary"
              ><Icon
                icon={linkingProvider === provider.id ? 'ion:reload-outline' : 'ion:link-outline'}
                class="size-4 {linkingProvider === provider.id ? 'motion-safe:animate-spin' : ''}"
                aria-hidden="true"
              />{m.account_connect()}</Button
            >
          </article>
        {/if}
      {/each}
      {#each passkeys as passkey}
        <article class="flex items-center justify-between gap-4 p-5">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
            >
              <Icon icon="ion:key-outline" class="size-5" />
            </div>
            <div>
              <p class="font-body font-semibold text-foreground">
                {passkey.name ?? m.account_passkey()}
              </p>
              <p class="mt-1 font-body text-sm text-foreground-alt">
                {m.account_connected_method()}
              </p>
            </div>
          </div>
          <Button
            onclick={() => removePasskey(passkey.id)}
            disabled={removingPasskeyId !== null}
            size="compact"
            variant="secondary"
            >{removingPasskeyId === passkey.id ? m.account_removing() : m.account_remove()}</Button
          >
        </article>
      {/each}
      <article class="flex items-center justify-between gap-4 p-5">
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
          >
            <Icon icon="ion:key-outline" class="size-5" />
          </div>
          <div>
            <p class="font-body font-semibold text-foreground">{m.account_passkey()}</p>
            <p class="mt-1 font-body text-sm text-foreground-alt">
              {m.account_passkey_description()}
            </p>
          </div>
        </div>
        <Button
          aria-busy={addingPasskey}
          disabled={addingPasskey}
          onclick={addPasskey}
          size="compact"
          variant="primary"
          ><Icon
            icon={addingPasskey ? 'ion:reload-outline' : 'ion:key-outline'}
            class="size-4 {addingPasskey ? 'motion-safe:animate-spin' : ''}"
            aria-hidden="true"
          />{m.account_add_passkey()}</Button
        >
      </article>
      {#if !linked('credential')}
        <article class="flex items-center justify-between gap-4 p-5">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-full bg-surface-container-low text-secondary"
            >
              <Icon icon="ion:mail-outline" class="size-5" />
            </div>
            <div>
              <p class="font-body font-semibold text-foreground">
                {m.account_email_password()}
              </p>
              <p class="mt-1 font-body text-sm text-foreground-alt">
                {m.account_not_connected()}
              </p>
            </div>
          </div>
          <Button
            onclick={() => { passwordDialogMode = 'add'; passwordDialogOpen = true }}
            size="compact"
            variant="primary"
            >{m.account_add_password()}</Button
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
        >{passwordDialogMode === 'add' ? m.account_add_email_password() : m.account_change_password()}</Dialog.Title
      ><Dialog.Description
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt"
        >{passwordDialogMode === 'add' ? m.account_add_password_description() : m.account_change_password_description()}</Dialog.Description
      >
      <form
        class="mt-6"
        onsubmit={event => { event.preventDefault(); passwordDialogMode === 'add' ? addPassword() : changePassword() }}
      >
        {#if passwordDialogMode === 'change'}
          <label class="font-body text-sm font-semibold text-foreground"
            >{m.account_current_password()}
            <input
              bind:value={currentPassword}
              class="mt-2 min-h-11 w-full border border-border-input bg-background-alt px-3 font-body font-normal"
              required
              type="password"
            ></label
          >
        {/if}
        <label class="font-body text-sm font-semibold text-foreground"
          >{m.account_new_password()}
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
            >{m.common_cancel()}</Button
          ><Button type="submit" variant="primary"
            >{passwordDialogMode === 'add' ? m.account_add_password() : m.account_change_password()}</Button
          >
        </div>
      </form></Dialog.Content
    ></Dialog.Portal
  >
</Dialog.Root>
