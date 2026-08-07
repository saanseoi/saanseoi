<script lang="ts">
import { Button, Main } from '$lib/bits'
import Icon from '@iconify/svelte'
import { authClient } from '$lib/auth-client'
import type { SocialProvider } from '$lib/auth-providers'
import { m } from '$lib/bits/internal/i18n'
import AuthSocialButtons from '$lib/bits/patterns/auth/authSocialButtons.svelte'
import { page } from '$app/state'

let email = $state('')
let password = $state('')
let error = $state<string | null>(null)
let busy = $state(false)
let showEmailForm = $state(false)
const next = $derived(page.url.searchParams.get('next') ?? '/api-keys')

const signIn = async () => {
  busy = true
  error = null
  const result = await authClient.signIn.email({ email, password, callbackURL: next })
  busy = false
  if (result.error) error = result.error.message ?? m.auth_sign_in_error()
  else window.location.assign(next)
}

const socialSignIn = async (provider: SocialProvider) => {
  await authClient.signIn.social({ provider, callbackURL: next })
}

const openEmailForm = () => {
  error = null
  showEmailForm = true
}

const passkeySignIn = async () => {
  if (busy) return
  busy = true
  error = null
  try {
    const result = await authClient.signIn.passkey()
    if (result.error) error = result.error.message ?? m.auth_passkey_error()
    else window.location.assign(next)
  } catch {
    error = m.auth_passkey_error()
  } finally {
    busy = false
  }
}
</script>

<svelte:head><title>{m.auth_sign_in_title()} | Saanseoi</title></svelte:head>
<Main class="mx-auto w-full max-w-xl px-6 py-14 md:py-20"
  ><p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <h1 class="mt-3 font-display text-headline-lg font-bold text-primary">
    {m.auth_sign_in_title()}
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.auth_sign_in_description()}
  </p>
  <AuthSocialButtons disabled={busy} onselect={socialSignIn} />
  <div class="my-7 flex items-center gap-3" aria-hidden="true">
    <div class="h-px flex-1 bg-border-card"></div>
    <span
      class="font-body text-label-sm font-semibold tracking-[0.14em] text-foreground-alt uppercase"
      >{m.common_or()}</span
    >
    <div class="h-px flex-1 bg-border-card"></div>
  </div>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Button disabled={busy} onclick={openEmailForm} variant="secondary"
      ><Icon icon="ion:mail-outline" class="size-5" />{m.common_email()}</Button
    >
    <Button disabled={busy} onclick={passkeySignIn} variant="secondary"
      ><Icon icon="ion:key-outline" class="size-5" />{m.account_passkey()}</Button
    >
  </div>
  {#if showEmailForm}
    <form
      class="mt-7 space-y-4"
      onsubmit={event => { event.preventDefault(); signIn() }}
    >
      <label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.common_email()}
        <input
          bind:value={email}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          required
          type="email"
        ></label
      ><label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.common_password()}
        <input
          bind:value={password}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          required
          type="password"
        ></label
      >
      <a
        class="block w-fit font-body text-body-sm text-secondary hover:underline"
        href="/password/forgot"
        >{m.auth_forgot_password()}</a
      >
      {#if error}
        <p class="font-body text-body-sm text-destructive">{error}</p>
      {/if}
      <Button disabled={busy} type="submit" variant="primary"
        >{busy ? m.auth_signing_in() : m.auth_sign_in_title()}</Button
      >
    </form>
  {:else if error}
    <p class="mt-4 font-body text-body-sm text-destructive">{error}</p>
  {/if}
  <p class="mt-6 font-body text-body-md text-foreground-alt">
    {m.auth_new_to_saanseoi()}
    <a class="text-secondary hover:underline" href="/sign-up"
      >{m.auth_create_account()}</a
    >
  </p>
</Main>
