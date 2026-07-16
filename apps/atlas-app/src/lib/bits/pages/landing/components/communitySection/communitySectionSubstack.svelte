<script lang="ts">
import { env } from '$env/dynamic/public'
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { Input } from '$lib/bits/primitives/input'
import { Label } from '$lib/bits/primitives/label'
import CommunitySectionPrivacyAcknowledgement from './communitySectionPrivacyAcknowledgement.svelte'

type Props = { element?: HTMLElement }
let { element = $bindable() }: Props = $props()

let email = $state('')
let isSubmitting = $state(false)
let isSubscribed = $state(false)
let errorMessage = $state('')

const endpoint = env.PUBLIC_ATLAS_API_BASE_URL
  ? `${env.PUBLIC_ATLAS_API_BASE_URL}/v0/meta/substack`
  : 'http://localhost:8787/v0/meta/substack'

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault()

  if (isSubmitting || isSubscribed) return

  errorMessage = ''
  isSubmitting = true

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
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

<div class="newsletter-content relative z-1" bind:this={element}>
  {#if isSubscribed}
    <div class="newsletter-card newsletter-success" role="status">
      <p class="newsletter-success-title">{m.newsletter_success_title()}</p>
      <p class="newsletter-success-body">{m.newsletter_success_body()}</p>
    </div>
  {:else}
    <form
      class="newsletter-card newsletter-form grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 p-[clamp(1rem,2.8vw,1.35rem)] max-[900px]:grid-cols-1"
      onsubmit={handleSubmit}
    >
      <div class="newsletter-field min-w-0">
        <Label class="sr-only" for="newsletter-email">
          {m.newsletter_email_label()}
        </Label>
        <Input
          class="newsletter-input"
          id="newsletter-email"
          name="email"
          placeholder={m.newsletter_email_placeholder()}
          type="email"
          bind:value={email}
          disabled={isSubmitting}
          required
        />
      </div>
      <Button
        class="newsletter-submit"
        type="submit"
        variant="primary"
        disabled={isSubmitting}
      >
        {m.newsletter_submit()}
      </Button>
    </form>

    {#if errorMessage}
      <p class="newsletter-error">{errorMessage}</p>
    {/if}
  {/if}

  <CommunitySectionPrivacyAcknowledgement />
</div>

<style>
.newsletter-content {
  display: grid;
  min-height: 12.5rem;
  grid-template-columns: 1fr;
  gap: 0;
  align-items: center;
  isolation: isolate;
}

.newsletter-card {
  position: relative;
  width: 100%;
  margin-left: 0;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 86%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-container-lowest) 86%, transparent),
    color-mix(in srgb, var(--surface) 96%, transparent)
  );
  box-shadow: 0 1.2rem 3.2rem rgb(0 0 0 / 0.11);
  grid-area: 1 / 1;
}

.newsletter-card::before {
  position: absolute;
  top: -1px;
  right: 1.25rem;
  left: 1.25rem;
  height: 1px;
  content: "";
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--secondary) 70%, transparent),
    color-mix(in srgb, var(--tertiary) 55%, transparent),
    transparent
  );
}

:global(.newsletter-input) {
  min-height: 3.55rem;
  border: 1px solid color-mix(in srgb, var(--foreground-alt) 24%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  padding-inline: 1rem;
  color: var(--primary);
}

:global(.newsletter-input:focus) {
  border-color: var(--secondary);
}

:global(.newsletter-submit) {
  min-width: 9.5rem;
  min-height: 3.55rem;
  box-shadow: 0 0.8rem 1.8rem rgb(0 0 0 / 0.14);
}

.newsletter-success {
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

:global(.newsletter-success + .newsletter-privacy) {
  top: calc(50% + 5rem);
}

.newsletter-success-title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 2.4vw, 2.15rem);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}

.newsletter-success-body {
  margin-top: 0.75rem;
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--foreground-alt);
}

.newsletter-error {
  position: absolute;
  top: calc(50% + 3.75rem);
  right: 0;
  left: 0;
  width: 100%;
  margin-top: 0.85rem;
  margin-left: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: #9f3221;
}

:global(.newsletter-privacy) {
  position: absolute;
  top: calc(50% + 3.75rem);
  right: 0;
  left: 0;
  width: 100%;
  margin-top: 0;
  margin-left: 0;
  text-align: center;
  font-family: var(--font-body);
  font-size: 0.78rem;
  line-height: 1.55;
  color: color-mix(in srgb, var(--foreground-alt) 70%, transparent);
}

:global(.newsletter-error + .newsletter-privacy) {
  top: calc(50% + 5.55rem);
}

:global(.newsletter-privacy a) {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

@media (max-width: 900px) {
  .newsletter-content {
    display: flex;
    min-height: 0;
    flex-direction: column;
  }

  .newsletter-card {
    width: 100%;
  }

  .newsletter-error,
  :global(.newsletter-privacy),
  :global(.newsletter-error + .newsletter-privacy) {
    position: static;
    margin-top: 0.8rem;
  }

  :global(.newsletter-submit) {
    width: 100%;
  }
}
</style>
