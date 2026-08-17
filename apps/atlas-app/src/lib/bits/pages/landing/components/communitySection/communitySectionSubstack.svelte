<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Input } from '#lib/bits/primitives/input/index.js'
import { Label } from '#lib/bits/primitives/label/index.js'
import CommunitySectionPrivacyAcknowledgement from './communitySectionPrivacyAcknowledgement.svelte'

type Props = { element?: HTMLElement }

let { element = $bindable() }: Props = $props()
let email = $state('')
let isSubmitting = $state(false)
let isSubscribed = $state(false)
let errorMessage = $state('')

const endpoint = PUBLIC_ATLAS_API_BASE_URL
  ? `${PUBLIC_ATLAS_API_BASE_URL}/v0/meta/substack`
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
    <div class="newsletter-form-stack">
      <form
        class="newsletter-card newsletter-form p-[clamp(1rem,2.8vw,1.35rem)]"
        id="newsletter-subscription"
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
          class="newsletter-submit inline-flex min-h-12! w-fit items-center gap-2 rounded-xl! bg-secondary! px-5 py-3 font-body text-[0.93rem] font-bold text-on-secondary! shadow-none transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
          type="submit"
          variant="primary"
          disabled={isSubmitting}
        >
          <Icon icon="lucide:mail" class="size-4" aria-hidden="true" />
          {m.newsletter_submit()}
        </Button>
      </form>
    </div>

    {#if errorMessage}
      <p class="newsletter-error">{errorMessage}</p>
    {/if}
  {/if}

  <CommunitySectionPrivacyAcknowledgement />
</div>

<style>
.newsletter-content {
  display: flex;
  min-height: 12.5rem;
  flex-direction: column;
  align-items: center;
  isolation: isolate;
}

.newsletter-form-stack {
  display: grid;
  width: 100%;
  justify-items: center;
}

.newsletter-form {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
}

.newsletter-field {
  width: 100%;
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
    color-mix(in srgb, var(--secondary) 55%, transparent),
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

:global(.newsletter-submit:hover) {
  box-shadow: 0 0 1.5rem color-mix(in srgb, var(--secondary) 45%, transparent);
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
  position: static;
  width: 100%;
  margin-top: 0.9rem;
  text-align: center;
  font-family: var(--font-body);
  font-size: 0.78rem;
  line-height: 1.55;
  color: color-mix(in srgb, var(--foreground-alt) 70%, transparent);
}

:global(.newsletter-error + .newsletter-privacy) {
  margin-top: 0.9rem;
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

  form.newsletter-form {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .newsletter-field {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--outline-variant) 86%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-container-lowest) 86%, transparent),
      color-mix(in srgb, var(--surface) 96%, transparent)
    );
  }

  :global(.newsletter-submit) {
    justify-self: end;
  }

  .newsletter-error,
  :global(.newsletter-privacy),
  :global(.newsletter-error + .newsletter-privacy) {
    position: static;
    margin-top: 0.8rem;
  }
}

@media (min-width: 901px) and (max-height: 1050px) {
  .newsletter-content {
    min-height: 10rem;
  }

  :global(.newsletter-input),
  :global(.newsletter-submit) {
    min-height: 3rem;
  }
}

@media (min-width: 901px) {
  .newsletter-content {
    min-height: 0;
    position: relative;
    z-index: 3;
    pointer-events: auto;
  }

  :global(.newsletter-form),
  :global(.newsletter-submit) {
    pointer-events: auto;
  }
}
</style>
