<script lang="ts">
import { Button, Main } from '$lib/bits'
import { authClient } from '$lib/auth-client'
import { m } from '$lib/bits/internal/i18n'

let name = $state('')
let email = $state('')
let password = $state('')
let message = $state<string | null>(null)
let error = $state<string | null>(null)
let busy = $state(false)

const signUp = async () => {
  busy = true
  error = null
  const result = await authClient.signUp.email({
    name,
    email,
    password,
    callbackURL: '/api-keys',
  })
  busy = false
  if (result.error) error = result.error.message ?? m.auth_sign_up_error()
  else message = m.auth_verify_email_message()
}

const socialSignUp = async (provider: 'google' | 'github') => {
  await authClient.signIn.social({ provider, callbackURL: '/api-keys' })
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
  <div class="mt-8 grid grid-cols-2 gap-3">
    <Button onclick={() => socialSignUp('google')} variant="secondary"
      >{m.common_google()}</Button
    ><Button onclick={() => socialSignUp('github')} variant="secondary"
      >{m.common_github()}</Button
    >
  </div>
  <div class="my-7 border-t border-border-card"></div>
  <form class="space-y-4" onsubmit={event => { event.preventDefault(); signUp() }}>
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
  <p class="mt-6 font-body text-body-md text-foreground-alt">
    {m.auth_already_have_account()}
    <a class="text-secondary hover:underline" href="/sign-in"
      >{m.auth_sign_in_title()}</a
    >
  </p>
</Main>
