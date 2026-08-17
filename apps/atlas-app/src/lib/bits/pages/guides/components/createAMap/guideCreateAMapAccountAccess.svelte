<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { slide } from 'svelte/transition'

import type { SocialProvider } from '#lib/auth-providers.js'
import { authClient } from '#lib/auth-client.js'
import { m } from '#lib/bits/internal/i18n.js'

type AccountMode = 'sign-in' | 'sign-up'
type Props = {
  continueUrl: string
  id?: string
}

let { continueUrl, id }: Props = $props()
let mode = $state<AccountMode>('sign-up')
let name = $state('')
let email = $state('')
let password = $state('')
let emailFormMode = $state<AccountMode>()
let emailError = $state<string>()
let emailMessage = $state<string>()
let emailPending = $state(false)
let passkeyError = $state<string>()
let passkeyPending = $state(false)
let pendingProvider = $state<SocialProvider>()
let socialError = $state<string>()

const providers: { id: SocialProvider; icon: string; label: () => string }[] = [
  { id: 'google', icon: 'ion:logo-google', label: () => m.common_google() },
  { id: 'facebook', icon: 'ion:logo-facebook', label: () => m.common_facebook() },
  { id: 'github', icon: 'ion:logo-github', label: () => m.common_github() },
]

const continueWithSocial = async (provider: SocialProvider) => {
  if (pendingProvider || passkeyPending) return
  socialError = undefined
  pendingProvider = provider
  try {
    const result = await authClient.signIn.social({
      provider,
      callbackURL: continueUrl,
    })
    if (!result.error) return
    socialError = result.error.message ?? m.auth_sign_in_error()
  } catch {
    socialError = m.auth_sign_in_error()
  }

  pendingProvider = undefined
}

const openEmailForm = (accountMode: AccountMode) => {
  emailError = undefined
  emailMessage = undefined
  socialError = undefined
  emailFormMode = accountMode
}

const continueWithEmail = async (accountMode: AccountMode) => {
  if (emailPending) return

  emailPending = true
  emailError = undefined
  emailMessage = undefined
  try {
    if (accountMode === 'sign-in') {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: continueUrl,
      })
      if (result.error) emailError = result.error.message ?? m.auth_sign_in_error()
      else window.location.assign(continueUrl)
    } else {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: continueUrl,
      })
      if (result.error) emailError = result.error.message ?? m.auth_sign_up_error()
      else emailMessage = m.auth_verify_email_message()
    }
  } catch {
    emailError =
      accountMode === 'sign-in' ? m.auth_sign_in_error() : m.auth_sign_up_error()
  } finally {
    emailPending = false
  }
}

const continueWithPasskey = async () => {
  if (passkeyPending) return

  passkeyPending = true
  passkeyError = undefined
  try {
    const result = await authClient.signIn.passkey()
    if (result.error) passkeyError = m.auth_passkey_error()
    else window.location.assign(continueUrl)
  } catch {
    passkeyError = m.auth_passkey_error()
  } finally {
    passkeyPending = false
  }
}

const switchMode = (nextMode: AccountMode) => {
  mode = nextMode
  emailFormMode = undefined
  emailError = undefined
  emailMessage = undefined
  passkeyError = undefined
  socialError = undefined
}
</script>

{#snippet accessOptions(accountMode: AccountMode)}
  <div class="min-w-0">
    <p class="font-body text-body-md leading-7 text-foreground-alt">
      {accountMode === 'sign-up'
        ? m.guide_basemap_account_options()
        : m.guide_basemap_sign_in_options()}
    </p>
    <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {#each providers as provider (provider.id)}
        <button
          aria-label={`${accountMode === 'sign-up' ? m.auth_create_account() : m.auth_sign_in_title()} ${provider.label()}`}
          aria-busy={pendingProvider === provider.id}
          class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 border border-border-card bg-background p-3 font-body text-body-sm font-semibold text-primary transition-colors hover:border-secondary hover:bg-secondary-container/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary disabled:cursor-wait disabled:opacity-60"
          disabled={pendingProvider !== undefined || passkeyPending}
          onclick={() => continueWithSocial(provider.id)}
          type="button"
        >
          <Icon
            icon={pendingProvider === provider.id ? 'ion:reload-outline' : provider.icon}
            class="size-7 text-secondary {pendingProvider === provider.id ? 'motion-safe:animate-spin' : ''}"
            aria-hidden="true"
          />
          <span>{provider.label()}</span>
        </button>
      {/each}
      <button
        aria-expanded={emailFormMode === accountMode}
        aria-label={`${accountMode === 'sign-up' ? m.auth_create_account() : m.auth_sign_in_title()} ${m.common_email()}`}
        class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 border border-border-card bg-background p-3 font-body text-body-sm font-semibold text-primary transition-colors hover:border-secondary hover:bg-secondary-container/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
        onclick={() => openEmailForm(accountMode)}
        type="button"
      >
        <Icon
          icon="ion:mail-outline"
          class="size-7 text-secondary"
          aria-hidden="true"
        />
        <span>{m.common_email()}</span>
      </button>
      <button
        aria-label={m.auth_continue_with_passkey()}
        class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 border border-border-card bg-background p-3 font-body text-body-sm font-semibold text-primary transition-colors hover:border-secondary hover:bg-secondary-container/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary disabled:cursor-wait disabled:opacity-60"
        aria-busy={passkeyPending}
        disabled={passkeyPending || pendingProvider !== undefined}
        onclick={continueWithPasskey}
        type="button"
      >
        <Icon
          icon={passkeyPending ? 'ion:reload-outline' : 'ion:key-outline'}
          class="size-7 text-secondary {passkeyPending ? 'motion-safe:animate-spin' : ''}"
          aria-hidden="true"
        />
        <span>{m.account_passkey()}</span>
      </button>
      <button
        aria-label={`${m.common_wechat()} (${m.common_coming_soon()})`}
        class="flex aspect-square w-full cursor-not-allowed flex-col items-center justify-center gap-3 border border-border-card bg-background p-3 font-body text-body-sm font-semibold text-primary opacity-55"
        disabled
        title={m.common_coming_soon()}
        type="button"
      >
        <Icon icon="ion:logo-wechat" class="size-7 text-secondary" aria-hidden="true" />
        <span>{m.common_wechat()}</span>
        <span class="text-xs font-normal text-foreground-alt"
          >{m.common_coming_soon()}</span
        >
      </button>
    </div>
    {#if emailFormMode === accountMode}
      <form
        class="mt-5 grid gap-4 sm:grid-cols-2"
        onsubmit={event => {
          event.preventDefault()
          continueWithEmail(accountMode)
        }}
        transition:slide={{ duration: 200 }}
      >
        {#if accountMode === 'sign-up'}
          <label class="font-body text-body-sm font-semibold text-foreground"
            >{m.auth_name()}
            <input
              bind:value={name}
              autocomplete="name"
              class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
              required
            >
          </label>
        {/if}
        <label class="font-body text-body-sm font-semibold text-foreground"
          >{m.common_email()}
          <input
            bind:value={email}
            autocomplete="email"
            class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
            required
            type="email"
          >
        </label>
        <label class="font-body text-body-sm font-semibold text-foreground"
          >{m.common_password()}
          <input
            bind:value={password}
            autocomplete={accountMode === 'sign-up' ? 'new-password' : 'current-password'}
            class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
            required
            type="password"
          >
        </label>
        {#if emailError}
          <p class="font-body text-body-sm text-destructive sm:col-span-2" role="alert">
            {emailError}
          </p>
        {/if}
        {#if emailMessage}
          <p class="font-body text-body-sm text-secondary sm:col-span-2" role="status">
            {emailMessage}
          </p>
        {/if}
        <button
          class="min-h-12 cursor-pointer bg-primary px-5 py-3 font-body text-label-md font-semibold text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary disabled:cursor-wait disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
          disabled={emailPending}
          type="submit"
        >
          {emailPending
            ? accountMode === 'sign-up'
              ? m.auth_creating()
              : m.auth_signing_in()
            : accountMode === 'sign-up'
              ? m.auth_create_account()
              : m.auth_sign_in_title()}
        </button>
      </form>
    {/if}
  </div>
{/snippet}

<div {id} class="mt-8 max-w-3xl overflow-hidden">
  <div
    class={`flex w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none ${mode === 'sign-in' ? '-translate-x-1/2' : 'translate-x-0'}`}
  >
    <section
      aria-label={m.guide_basemap_account()}
      class="w-1/2 shrink-0"
      inert={mode !== 'sign-up'}
    >
      <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_8rem] md:items-center">
        {@render accessOptions('sign-up')}
        <div
          class="flex items-center gap-3 md:self-stretch md:flex-col md:gap-0"
          aria-hidden="true"
        >
          <span class="h-px flex-1 bg-border-card md:h-auto md:w-px"></span>
          <span
            class="shrink-0 bg-background px-2 py-1 font-body text-label-sm font-semibold tracking-[0.14em] text-foreground-alt uppercase md:px-0 md:py-2"
            >{m.common_or()}</span
          >
          <span class="h-px flex-1 bg-border-card md:h-auto md:w-px"></span>
        </div>
        <button
          class="min-h-12 cursor-pointer px-5 py-4 font-body text-label-md font-semibold text-foreground-alt transition-colors hover:bg-surface-container-low hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary md:self-center"
          onclick={() => switchMode('sign-in')}
          type="button"
        >
          {m.auth_sign_in_title()}
        </button>
      </div>
    </section>
    <section
      aria-label={m.auth_sign_in_title()}
      class="w-1/2 shrink-0"
      inert={mode !== 'sign-in'}
    >
      <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_8rem] md:items-center">
        {@render accessOptions('sign-in')}
        <div
          class="flex items-center gap-3 md:self-stretch md:flex-col md:gap-0"
          aria-hidden="true"
        >
          <span class="h-px flex-1 bg-border-card md:h-auto md:w-px"></span>
          <span
            class="shrink-0 bg-background px-2 py-1 font-body text-label-sm font-semibold tracking-[0.14em] text-foreground-alt uppercase md:px-0 md:py-2"
            >{m.common_or()}</span
          >
          <span class="h-px flex-1 bg-border-card md:h-auto md:w-px"></span>
        </div>
        <button
          class="min-h-12 cursor-pointer px-5 py-4 font-body text-label-md font-semibold text-foreground-alt transition-colors hover:bg-surface-container-low hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary md:self-center"
          onclick={() => switchMode('sign-up')}
          type="button"
        >
          {m.guide_basemap_sign_up()}
        </button>
      </div>
    </section>
  </div>
  {#if passkeyError}
    <p class="mt-4 font-body text-body-sm text-destructive" role="alert">
      {passkeyError}
    </p>
  {/if}
  {#if socialError}
    <p class="mt-4 font-body text-body-sm text-destructive" role="alert">
      {socialError}
    </p>
  {/if}
</div>
