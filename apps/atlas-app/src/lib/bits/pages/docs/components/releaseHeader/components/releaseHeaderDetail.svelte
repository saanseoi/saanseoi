<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Popover } from 'bits-ui'
import { slide } from 'svelte/transition'

type Detail = {
  label: string
  value: string
  isMonospace?: boolean
  disclosure?: Array<{
    label: string
    value: string
    codeValues?: string[]
    isMonospace?: boolean
    href?: string
    isExternal?: boolean
  }>
}

type Props = {
  detail: Detail
  isOpen: boolean
  popover?: boolean
  align?: 'start' | 'end'
  noWrap?: boolean
  onToggle: () => void
}

let {
  detail,
  isOpen,
  popover = false,
  align = 'start',
  noWrap = false,
  onToggle,
}: Props = $props()
</script>

{#if popover}
  <Popover.Root>
    <Popover.Trigger openOnHover openDelay={180}>
      {#snippet child({
        props,
      })}
        <div class="flex min-w-0 items-start gap-2">
          <button
            {...props}
            class={`group block min-w-0 flex-1 cursor-help ${align === 'end' ? 'text-right' : 'text-left'} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary`}
            type="button"
          >
            <span
              class="block text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
              >{detail.label}</span
            >
            <span
              class={`mt-2 block min-w-0 font-mono text-sm font-semibold text-primary ${noWrap ? 'whitespace-nowrap' : 'wrap-break-word'}`}
              >{detail.value}</span
            >
          </button>
        </div>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        class="z-70 w-max max-w-[min(32rem,calc(100vw-2rem))] rounded-default border border-border-card/60 bg-background-alt px-4 py-3 font-body text-label-sm text-foreground shadow-popover"
        side="top"
        {align}
        sideOffset={8}
        collisionPadding={16}
      >
        <dl class="grid w-max max-w-full gap-3">
          {#each detail.disclosure ?? [] as item}
            <div>
              <dt
                class="text-caption font-semibold uppercase tracking-widest text-foreground-alt/70"
              >
                {item.label}
              </dt>
              <dd
                class="mt-1.5 min-w-0 font-mono text-sm font-semibold leading-5 text-primary"
              >
                {#if item.codeValues?.length}
                  <span class="whitespace-nowrap">
                    {#each item.codeValues as value, index}
                      {#if index > 0}
                        <span>, </span>
                      {/if}
                      <code
                        class="rounded-sm bg-surface-container-high px-1 py-0.5 text-secondary"
                        >{value}</code
                      >
                    {/each}
                  </span>
                {:else if item.href}
                  <a
                    class="inline-flex items-center gap-1 text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
                    href={item.href}
                    target={item.isExternal ? '_blank' : undefined}
                    rel={item.isExternal ? 'noopener noreferrer' : undefined}
                  >
                    {item.value}
                    {#if item.isExternal}
                      <Icon
                        icon="ion:open-outline"
                        class="size-3.5"
                        aria-hidden="true"
                      />
                    {/if}
                  </a>
                {:else}
                  {item.value}
                {/if}
              </dd>
            </div>
          {/each}
        </dl>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{:else}
  <div class="min-w-0">
    <button
      class={`group block w-full min-w-0 cursor-pointer ${align === 'end' ? 'text-right' : 'text-left'} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary`}
      type="button"
      aria-expanded={isOpen}
      onclick={onToggle}
    >
      <span
        class="flex items-center gap-1 text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
      >
        {detail.label}
        <Icon
          icon="ion:chevron-down-outline"
          class={`size-3.5 transition-transform duration-180 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </span>
      <span
        class="mt-2 block min-w-0 wrap-break-word font-mono text-sm font-semibold text-primary"
      >
        {detail.value}
      </span>
    </button>

    {#if isOpen}
      <dl
        class="mt-4 grid gap-3 border-l-2 border-outline-variant pl-4 text-left"
        transition:slide={{ duration: 180, axis: 'y' }}
      >
        {#each detail.disclosure ?? [] as item}
          <div>
            <dt
              class="text-caption font-semibold uppercase tracking-widest text-foreground-alt/70"
            >
              {item.label}
            </dt>
            <dd
              class="mt-1.5 min-w-0 wrap-break-word font-mono text-sm font-semibold leading-5 text-primary"
            >
              {#if item.href}
                <a
                  class="inline-flex items-center gap-1 text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
                  href={item.href}
                  target={item.isExternal ? '_blank' : undefined}
                  rel={item.isExternal ? 'noopener noreferrer' : undefined}
                >
                  {item.value}
                  {#if item.isExternal}
                    <Icon icon="ion:open-outline" class="size-3.5" aria-hidden="true" />
                  {/if}
                </a>
              {:else}
                {item.value}
              {/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
{/if}
