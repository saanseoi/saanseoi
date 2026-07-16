<script lang="ts">
import { Button, Main } from '$lib/bits'
import { authClient } from '$lib/auth-client'
import { page } from '$app/state'
import { m } from '$lib/bits/internal/i18n'

const token = $derived(page.url.searchParams.get('token'))
const invalid = $derived(page.url.searchParams.has('error') || !token)
let password = $state('')
let confirmation = $state('')
let error = $state<string | null>(null)
let complete = $state(false)

const resetPassword = async () => {
  if (password !== confirmation) {
    error = m.auth_passwords_do_not_match()
    return
  }

  const result = await authClient.resetPassword({
    newPassword: password,
    token: token ?? undefined,
  })
  if (result.error) error = result.error.message ?? m.auth_reset_error()
  else complete = true
}
</script>

<svelte:head><title>{m.auth_choose_new_password()} | Saanseoi</title></svelte:head>

<Main class="mx-auto w-full max-w-xl px-6 py-14 md:py-20">
  <p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <h1 class="mt-3 font-display text-headline-lg font-bold text-primary">
    {m.auth_choose_new_password()}
  </h1>
  {#if invalid}
    <p class="mt-5 font-body text-body-lg text-destructive">
      {m.auth_reset_link_invalid()}
      <a class="text-secondary hover:underline" href="/forgot-password"
        >{m.auth_request_new_link()}</a
      >.
    </p>
  {:else if complete}
    <p class="mt-5 font-body text-body-lg leading-8 text-foreground-alt">
      {m.auth_password_reset_complete()}
      <a class="text-secondary hover:underline" href="/sign-in"
        >{m.auth_sign_in_title()}</a
      >.
    </p>
  {:else}
    <form
      class="mt-8 space-y-4"
      onsubmit={event => { event.preventDefault(); resetPassword() }}
    >
      <label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.account_new_password()}
        <input
          bind:value={password}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          minlength="8"
          required
          type="password"
        ></label
      >
      <label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.auth_confirm_new_password()}
        <input
          bind:value={confirmation}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          minlength="8"
          required
          type="password"
        ></label
      >
      {#if error}
        <p class="font-body text-body-sm text-destructive">{error}</p>
      {/if}
      <Button type="submit" variant="primary">{m.auth_reset_password()}</Button>
    </form>
  {/if}
</Main>
