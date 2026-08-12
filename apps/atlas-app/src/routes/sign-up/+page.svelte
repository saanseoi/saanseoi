<script lang="ts">
import { Button, Main } from '$lib/bits'
import { page } from '$app/state'
import Icon from '@iconify/svelte'
import { authClient } from '$lib/auth-client'
import type { SocialProvider } from '$lib/auth-providers'
import { m } from '$lib/bits/internal/i18n'
import AuthSocialButtons from '$lib/bits/patterns/auth/authSocialButtons.svelte'

let name = $state('')
let email = $state('')
let password = $state('')
let message = $state<string | null>(null)
let error = $state<string | null>(null)
let busy = $state(false)
let showEmailForm = $state(false)
let callbackUrl = $derived.by(() => {
  const candidate = page.url.searchParams.get('continue')
  return candidate?.startsWith('/') && !candidate.startsWith('//')
    ? candidate
    : '/api-keys'
})

const signUp = async () => {
  busy = true
  error = null
  const result = await authClient.signUp.email({
    name,
    email,
    password,
    callbackURL: callbackUrl,
  })
  busy = false
  if (result.error) error = result.error.message ?? m.auth_sign_up_error()
  else message = m.auth_verify_email_message()
}

const socialSignUp = async (provider: SocialProvider) => {
  await authClient.signIn.social({ provider, callbackURL: callbackUrl })
}

const openEmailForm = () => {
  error = null
  message = null
  showEmailForm = true
}
</script>

<svelte:head><title>{m.auth_sign_up_title()} | Saanseoi</title></svelte:head>
<Main class="mx-auto w-full max-w-xl px-6 py-14 md:py-20"
  ><p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <h1 class="mt-3 font-display text-headline-lg font-bold text-primary">
    {m.auth_sign_up_title()}
  </h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.auth_sign_up_description()}
  </p>
  <AuthSocialButtons disabled={busy} onselect={socialSignUp} />
  <div class="my-7 flex items-center gap-3" aria-hidden="true">
    <div class="h-px flex-1 bg-border-card"></div>
    <span
      class="font-body text-label-sm font-semibold tracking-[0.14em] text-foreground-alt uppercase"
      >{m.common_or()}</span
    >
    <div class="h-px flex-1 bg-border-card"></div>
  </div>
  <div>
    <Button disabled={busy} onclick={openEmailForm} variant="secondary"
      ><Icon icon="ion:mail-outline" class="size-5" />{m.common_email()}</Button
    >
  </div>
  {#if showEmailForm}
    <form
      class="mt-7 space-y-4"
      onsubmit={event => { event.preventDefault(); signUp() }}
    >
      <label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.auth_name()}
        <input
          bind:value={name}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          required
        ></label
      ><label class="block font-body text-body-sm font-semibold text-foreground"
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
          minlength="8"
          required
          type="password"
        ></label
      >
      {#if error}
        <p class="font-body text-body-sm text-destructive">{error}</p>
      {/if}
      {#if message}
        <p class="font-body text-body-sm text-secondary">{message}</p>
      {/if}
      <Button disabled={busy} type="submit" variant="primary"
        >{busy ? m.auth_creating() : m.auth_create_account()}</Button
      >
    </form>
  {:else if error}
    <p class="mt-4 font-body text-body-sm text-destructive">{error}</p>
  {/if}
  <p class="mt-6 font-body text-body-md text-foreground-alt">
    {m.auth_already_have_account()}
    <a class="text-secondary hover:underline" href="/sign-in"
      >{m.auth_sign_in_title()}</a
    >
  </p>
</Main>
