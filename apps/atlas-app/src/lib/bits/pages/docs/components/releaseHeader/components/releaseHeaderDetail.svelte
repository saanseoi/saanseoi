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
      {#snippet child({ props })}
        <div class="flex min-w-0 items-start gap-2">
          <button
            {...props}
            class={`group block min-w-0 flex-1 cursor-help ${align === 'end' ? 'text-right' : 'text-left'} focus-visible:outline-secondary focus-visible:outline-2 focus-visible:outline-offset-4`}
            type="button"
          >
            <span
              class="text-caption text-foreground-alt/70 block font-semibold tracking-[0.12em] uppercase"
              >{detail.label}</span
            >
            <span
              class={`text-primary mt-2 block min-w-0 font-mono text-sm font-semibold ${noWrap ? 'whitespace-nowrap' : 'wrap-break-word'}`}
              >{detail.value}</span
            >
          </button>
        </div>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        class="rounded-default border-border-card/60 bg-background-alt font-body text-label-sm text-foreground shadow-popover z-70 w-max max-w-[min(32rem,calc(100vw-2rem))] border px-4 py-3"
        side="top"
        {align}
        sideOffset={8}
        collisionPadding={16}
      >
        <dl class="grid w-max max-w-full gap-3">
          {#each detail.disclosure ?? [] as item}
            <div>
              <dt
                class="text-caption text-foreground-alt/70 font-semibold tracking-widest uppercase"
              >
                {item.label}
              </dt>
              <dd
                class="text-primary mt-1.5 min-w-0 font-mono text-sm leading-5 font-semibold"
              >
                {#if item.codeValues?.length}
                  <span class="whitespace-nowrap">
                    {#each item.codeValues as value, index}
                      {#if index > 0}
                        <span>, </span>
                      {/if}
                      <code
                        class="bg-surface-container-high text-secondary rounded-sm px-1 py-0.5"
                        >{value}</code
                      >
                    {/each}
                  </span>
                {:else if item.href}
                  <a
                    class="text-secondary decoration-secondary/40 hover:text-primary inline-flex items-center gap-1 underline underline-offset-4"
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
      class={`group block w-full min-w-0 cursor-pointer ${align === 'end' ? 'text-right' : 'text-left'} focus-visible:outline-secondary focus-visible:outline-2 focus-visible:outline-offset-4`}
      type="button"
      aria-expanded={isOpen}
      onclick={onToggle}
    >
      <span
        class="text-caption text-foreground-alt/70 flex items-center gap-1 font-semibold tracking-[0.12em] uppercase"
      >
        {detail.label}
        <Icon
          icon="ion:chevron-down-outline"
          class={`size-3.5 transition-transform duration-180 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </span>
      <span
        class="text-primary mt-2 block min-w-0 font-mono text-sm font-semibold wrap-break-word"
      >
        {detail.value}
      </span>
    </button>

    {#if isOpen}
      <dl
        class="border-outline-variant mt-4 grid gap-3 border-l-2 pl-4 text-left"
        transition:slide={{ duration: 180, axis: 'y' }}
      >
        {#each detail.disclosure ?? [] as item}
          <div>
            <dt
              class="text-caption text-foreground-alt/70 font-semibold tracking-widest uppercase"
            >
              {item.label}
            </dt>
            <dd
              class="text-primary mt-1.5 min-w-0 font-mono text-sm leading-5 font-semibold wrap-break-word"
            >
              {#if item.href}
                <a
                  class="text-secondary decoration-secondary/40 hover:text-primary inline-flex items-center gap-1 underline underline-offset-4"
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
