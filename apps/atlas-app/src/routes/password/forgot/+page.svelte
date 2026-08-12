<script lang="ts">
import { Button, Main } from '$lib/bits'
import { authClient } from '$lib/auth-client'
import { m } from '$lib/bits/internal/i18n'

let email = $state('')
let submitted = $state(false)
let busy = $state(false)

const requestReset = async () => {
  busy = true
  await authClient.requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}/password/reset`,
  })
  busy = false
  submitted = true
}
</script>

<svelte:head><title>{m.auth_reset_title()} | Saanseoi</title></svelte:head>

<Main class="mx-auto w-full max-w-xl px-6 py-14 md:py-20">
  <p
    class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
  >
    {m.api_keys_developer_account()}
  </p>
  <h1 class="mt-3 font-display text-headline-lg font-bold text-primary">
    {m.auth_reset_title()}
  </h1>
  {#if submitted}
    <p class="mt-5 font-body text-body-lg leading-8 text-foreground-alt">
      {m.auth_reset_sent()}
    </p>
  {:else}
    <p class="mt-3 font-body text-body-lg text-foreground-alt">
      {m.auth_reset_description()}
    </p>
    <form
      class="mt-8 space-y-4"
      onsubmit={event => { event.preventDefault(); requestReset() }}
    >
      <label class="block font-body text-body-sm font-semibold text-foreground"
        >{m.common_email()}
        <input
          bind:value={email}
          class="mt-2 min-h-12 w-full border border-border-input bg-background-alt px-4 font-body font-normal"
          required
          type="email"
        ></label
      >
      <Button disabled={busy} type="submit" variant="primary"
        >{busy ? m.auth_sending() : m.auth_send_reset_link()}</Button
      >
    </form>
  {/if}
  <p class="mt-6 font-body text-body-md text-foreground-alt">
    <a class="text-secondary hover:underline" href="/sign-in"
      >{m.auth_back_to_sign_in()}</a
    >
  </p>
</Main>
