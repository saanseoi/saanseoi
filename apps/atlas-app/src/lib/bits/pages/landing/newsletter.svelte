<script lang="ts">
import { env } from '$env/dynamic/public'
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { Input } from '$lib/bits/primitives/input'
import { Label } from '$lib/bits/primitives/label'

let email = $state('')
let isSubmitting = $state(false)
let isSubscribed = $state(false)
let errorMessage = $state('')

const endpoint = env.PUBLIC_ATLAS_API_BASE_URL
  ? `${env.PUBLIC_ATLAS_API_BASE_URL}/v1/meta/substack`
  : 'http://localhost:8787/v1/meta/substack'

// biome-ignore lint: incorrect lint/correctness/noUnusedVariables
async function handleSubmit(event: SubmitEvent) {
  event.preventDefault()

  if (isSubmitting || isSubscribed) {
    return
  }

  errorMessage = ''
  isSubmitting = true

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
      }),
    })

    const payload = (await response.json().catch(() => null)) as {
      message?: string
    } | null

    if (!response.ok) {
      throw new Error(payload?.message || m.newsletter_error_generic())
    }

    isSubscribed = true
    email = ''
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : m.newsletter_error_generic()
  } finally {
    isSubmitting = false
  }
}
</script>

<section
  class="mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) py-18 md:px-8 md:py-24 xl:px-(--spacing-margin-desktop)"
>
  <div class="mx-auto max-w-200 text-center">
    <h2
      class="font-display text-[2.6rem] font-bold leading-[1.02] tracking-tighter text-primary sm:text-[3.4rem]"
    >
      {m.newsletter_title()}
    </h2>
    <p class="mt-4 font-body text-body-md leading-[1.8] text-foreground-alt">
      {m.newsletter_description()}
    </p>

    {#if isSubscribed}
      <div
        class="mx-auto mt-8 max-w-2xl rounded-3xl border border-foreground/10 bg-surface/70 px-6 py-5 text-left"
      >
        <p class="font-display text-xl font-bold text-primary">
          {m.newsletter_success_title()}
        </p>
        <p class="mt-2 font-body text-body-sm leading-[1.7] text-foreground-alt">
          {m.newsletter_success_body()}
        </p>
      </div>
    {:else}
      <form
        class="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row"
        onsubmit={handleSubmit}
      >
        <div class="flex-1">
          <Label class="sr-only" for="newsletter-email">
            {m.newsletter_email_label()}
          </Label>
          <Input
            class="w-full"
            id="newsletter-email"
            name="email"
            placeholder={m.newsletter_email_placeholder()}
            type="email"
            bind:value={email}
            disabled={isSubmitting}
            required
          />
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {m.newsletter_submit()}
        </Button>
      </form>

      {#if errorMessage}
        <p class="mx-auto mt-3 max-w-2xl font-body text-body-sm text-[#9f3221]">
          {errorMessage}
        </p>
      {/if}
    {/if}

    <p class="mt-4 font-body text-[0.78rem] leading-normal text-foreground-alt/70">
      {m.newsletter_privacy()}
    </p>
  </div>
</section>
