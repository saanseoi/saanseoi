<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { Tooltip } from 'bits-ui'
import type { Json } from '@repo/core/provenance'

let { value, hierarchy = false }: { value: Json; hierarchy?: boolean } = $props()
let copied = $state(false)
let failed = $state(false)
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2')
const isUuid = (item: Json) =>
  typeof item === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item)
async function copy(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    copied = true
    failed = false
  } catch {
    failed = true
  }
}
</script>

{#snippet render(item: Json)}
  {#if Array.isArray(item)}
    <div class="space-y-1">
      {#each item as child, index}
        <div style:padding-left={hierarchy ? `${index * 1.5}rem` : undefined}>
          {@render render(child)}
        </div>
      {/each}
    </div>
  {:else if item !== null && typeof item === 'object'}
    {#if hierarchy && typeof item.division_id === 'string'}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="flex w-full justify-between gap-3 rounded text-left hover:bg-current/5"
          onclick={() => copy(String(item.division_id))}
        >
          <span class="opacity-55">{String(item.subtype)}:</span>
          <span class="min-w-0 text-right">{String(item.name)}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            class="z-70 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 text-xs text-foreground shadow-popover"
          >
            {item.division_id}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    {:else if typeof item.language === 'string' && 'value' in item}
      <dl>
        <div class="flex justify-between gap-3">
          <dt class="opacity-55">{item.language}:</dt>
          <dd class="min-w-0 text-right">{@render render(item.value)}</dd>
        </div>
      </dl>
    {:else}
      <dl class="space-y-1">
        {#each Object.entries(item) as [key, child]}
          <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt class="capitalize opacity-55">{label(key)}:</dt>
            <dd
              class="min-w-0"
              class:w-full={typeof child === 'object'}
              class:pl-6={typeof child === 'object'}
              class:text-right={typeof child !== 'object'}
            >
              {@render render(child)}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}
  {:else if isUuid(item)}
    <button
      type="button"
      class="cursor-copy rounded text-left hover:bg-current/5"
      title={m.source_audit_copy_id_value({ id: String(item) })}
      onclick={() => copy(String(item))}
    >
      {item}
    </button>
  {:else}
    {item === null ? m.source_audit_none_value() : String(item)}
  {/if}
{/snippet}

<Tooltip.Provider delayDuration={150}> {@render render(value)} </Tooltip.Provider>
<span class="sr-only" role="status"
  >{copied ? m.source_audit_record_id_clipboard() : ''}</span
>
{#if failed}
  <span role="alert" class="text-xs">{m.source_audit_copy_id_error({ id: '' })}</span>
{/if}
