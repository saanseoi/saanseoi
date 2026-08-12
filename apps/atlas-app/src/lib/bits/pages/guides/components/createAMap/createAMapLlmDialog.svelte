<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

type QuickstartLlmChoice = {
  icon: string
  label: string
  requiresPaste: boolean
  value: 'chatgpt' | 'claude' | 'deepseek' | 'gemini' | 'kimi'
}

type Props = {
  copiedPromptProvider: 'local' | 'gemini' | 'kimi' | undefined
  onCopyPromptForLocalAgent: () => void
  onOpenQuickstartLlm: (provider: QuickstartLlmChoice['value']) => void
  open: boolean
  pastePromptMessage: string
  quickstartLlmChoices: QuickstartLlmChoice[]
  quickstartPromptCopied: boolean
}

let {
  copiedPromptProvider,
  onCopyPromptForLocalAgent,
  onOpenQuickstartLlm,
  open: isOpen = $bindable(),
  pastePromptMessage,
  quickstartLlmChoices,
  quickstartPromptCopied,
}: Props = $props()
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-80 bg-black/70 backdrop-blur-md" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-90 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border-card bg-background shadow-popover focus:outline-none"
    >
      <div class="border-t-4 border-secondary px-6 pt-7 pb-6 sm:px-8 sm:pt-8">
        <div class="flex gap-4">
          <div
            class="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-secondary"
          >
            <Icon icon="proicons:sparkles" class="size-5" aria-hidden="true" />
          </div>
          <div>
            <p
              class="font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-secondary"
            >
              {@html m.guide_llm_modal_eyebrow()}
            </p>
            <Dialog.Title
              class="mt-1 font-display text-headline-md font-bold text-primary"
            >
              {@html m.guide_llm_modal_title()}
            </Dialog.Title>
            <Dialog.Description
              class="mt-3 max-w-2xl font-body text-body-md leading-7 text-foreground-alt"
            >
              {@html m.guide_llm_modal_description()}
            </Dialog.Description>
          </div>
        </div>

        <div
          class="mt-7 flex flex-col gap-4 border border-secondary/45 bg-secondary-container/35 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-background-alt text-secondary"
            >
              <Icon
                icon="material-symbols-light:smart-toy-outline"
                class="size-5"
                aria-hidden="true"
              />
            </span>
            <span class="min-w-0">
              <span
                class="block font-display text-body-lg leading-6 font-bold text-primary"
              >
                {@html m.guide_llm_modal_local_agent_title()}
              </span>
              <span
                class="mt-1 block font-body text-body-sm leading-6 text-foreground-alt"
              >
                {@html m.guide_llm_modal_local_agent_description()}
              </span>
            </span>
          </div>
          <Button
            class="shrink-0"
            onclick={onCopyPromptForLocalAgent}
            size="compact"
            variant="primary"
          >
            <Icon
              icon={quickstartPromptCopied ? 'ion:checkmark' : 'ion:copy-outline'}
              class="size-4"
              aria-hidden="true"
            />
            {quickstartPromptCopied ? m.common_copied() : m.common_copy()}
          </Button>
        </div>

        {#if copiedPromptProvider === 'local'}
          <p
            class="mt-4 border-l-4 border-secondary bg-secondary-container px-4 py-3 font-body text-body-md leading-7 text-foreground-alt"
            role="status"
          >
            {pastePromptMessage}
          </p>
        {/if}

        <p
          class="mt-7 font-body text-label-sm font-semibold uppercase tracking-[0.12em] text-foreground-alt"
        >
          {@html m.guide_llm_modal_web_chat_heading()}
        </p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          {#each quickstartLlmChoices as provider}
            <Button
              class="h-auto min-h-25 w-full justify-start px-4 py-4 text-left"
              onclick={() => onOpenQuickstartLlm(provider.value)}
              variant="secondary"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-background-alt text-secondary"
              >
                <Icon icon={provider.icon} class="size-5" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block font-display text-body-lg leading-6 font-bold text-primary"
                >
                  {@html provider.label}
                </span>
                <span
                  class="mt-1 block font-body text-label-sm font-semibold uppercase tracking-widest text-foreground-alt"
                >
                  {provider.requiresPaste ? m.guide_llm_modal_copy_and_open() : m.guide_llm_modal_open_with_prompt()}
                </span>
              </span>
              <Icon
                icon="proicons:arrow-up-right"
                class="size-4 shrink-0 text-secondary"
              />
            </Button>
          {/each}
        </div>

        {#if copiedPromptProvider === 'gemini' || copiedPromptProvider === 'kimi'}
          <p
            class="mt-5 border-l-4 border-secondary bg-secondary-container px-4 py-3 font-body text-body-md leading-7 text-foreground-alt"
            role="status"
          >
            {pastePromptMessage}
          </p>
        {/if}

        <div class="mt-6">
          <Button onclick={() => (isOpen = false)} variant="secondary"
            >{m.common_cancel()}</Button
          >
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
