<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

type Props = {
  choice: string
  completed: boolean
  region: string
  showIncompleteWarning: boolean
  onPaymentSuccessful: () => void
  onResetPayment: () => void
}

let {
  choice,
  completed,
  region,
  showIncompleteWarning,
  onPaymentSuccessful,
  onResetPayment,
}: Props = $props()
let expanded = $state(false)

$effect(() => {
  if (completed) expanded = false
})
</script>

<aside
  id="payment-readiness"
  class={`mb-5 max-w-3xl border-l-4 px-5 py-5 ${completed ? 'border-[#6fdec9] bg-[#6fdec9]/12' : 'border-[#ef8b88] bg-[#ef8b88]/12'}`}
  aria-labelledby="payment-warning-title"
>
  {#if completed}
    <button
      class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6fdec9]"
      type="button"
      aria-controls="payment-warning-details"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <Icon
        icon="material-symbols-light:check-circle-rounded"
        class="mt-0.5 size-5 shrink-0 text-[#6fdec9]"
        aria-hidden="true"
      />
      <span>
        <span
          id="payment-warning-title"
          class="block font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-[#6fdec9]"
        >
          {m.guide_payment_warning_complete_title()}
        </span>
        <span
          class="mt-2 block max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
        >
          {m.guide_payment_warning_complete().replace('{choice}', choice)}
        </span>
      </span>
    </button>
  {:else}
    <div class="flex items-start gap-3">
      <Icon
        icon={completed
        ? 'material-symbols-light:check-circle-rounded'
        : 'material-symbols-light:warning-rounded'}
        class={`mt-0.5 size-5 shrink-0 ${completed ? 'text-[#6fdec9]' : 'text-[#ef8b88]'}`}
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <h3
          id="payment-warning-title"
          class={`font-body text-label-sm font-semibold uppercase tracking-[0.12em] ${completed ? 'text-[#6fdec9]' : 'text-[#ffb4b1]'}`}
        >
          {m.guide_payment_warning_title().replace('{region}', region)}
        </h3>
        <p class="mt-2 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {m.guide_payment_warning_description()}
        </p>
        <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
          <Button
            href="https://evertry.co/blog/how-to-pay-for-chatgpt-in-hong-kong/"
            target="_blank"
            rel="noreferrer"
            size="compact"
            variant="secondary"
            class="shrink-0 px-4"
          >
            <Icon icon="proicons:book-open" class="size-4" aria-hidden="true" />
            {m.guide_payment_warning_workaround_instructions()}
          </Button>
          <Button
            class="shrink-0 bg-[#6fdec9] px-4 text-[#00201b] hover:bg-[#8aecd9]"
            size="compact"
            onclick={onPaymentSuccessful}
          >
            <Icon
              icon="material-symbols-light:check-rounded"
              class="size-5"
              aria-hidden="true"
            />
            {m.guide_payment_warning_successful()}
          </Button>
        </div>
        {#if showIncompleteWarning}
          <p
            class="mt-3 text-center font-[Krypton,var(--font-mono)] text-body-md leading-7 font-normal tracking-normal text-[#ffb4b1]"
            role="alert"
          >
            {m.guide_payment_warning_incomplete()}
          </p>
        {/if}
      </div>
    </div>
  {/if}
  {#if completed && expanded}
    <div
      id="payment-warning-details"
      class="ml-8 mt-5 border-t border-[#6fdec9]/35 pt-5"
    >
      <div class="flex flex-wrap justify-end gap-3">
        <Button
          href="https://evertry.co/blog/how-to-pay-for-chatgpt-in-hong-kong/"
          target="_blank"
          rel="noreferrer"
          size="compact"
          variant="secondary"
          class="px-4"
        >
          <Icon icon="proicons:book-open" class="size-4" aria-hidden="true" />
          {m.guide_payment_warning_workaround_instructions()}
        </Button>
        <Button
          size="compact"
          variant="secondary"
          class="px-4"
          onclick={onResetPayment}
        >
          <Icon
            icon="material-symbols-light:restart-alt-rounded"
            class="size-5"
            aria-hidden="true"
          />
          {m.guide_payment_warning_reset()}
        </Button>
      </div>
    </div>
  {/if}
</aside>
