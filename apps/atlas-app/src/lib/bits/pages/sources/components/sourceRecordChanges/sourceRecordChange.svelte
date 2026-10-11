<script lang="ts">
import type { JsonFieldChange } from '@repo/core/jsonFieldDiff'
import CopyId from './sourceRecordChangeCopyId.svelte'
import FieldTag from './sourceRecordChangeFieldTag.svelte'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import NestedField from '#lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesNestedField.svelte'
import {
  changeFields,
  recordSummary,
  expandableFields,
} from './sourceRecordChange.presentation'
import {
  sourceRecordChangesCopy,
  type SourceChangeType,
} from './sourceRecordChanges.copy'
let {
  id,
  type,
  fields,
  before,
  after,
  diff = true,
  locale,
}: {
  id: string
  type: SourceChangeType
  fields: JsonFieldChange[]
  before: unknown
  after: unknown
  diff?: boolean
  locale: keyof typeof sourceRecordChangesCopy
} = $props()
let expanded = $state(false)
const copy = $derived(sourceRecordChangesCopy[locale])
const comparison = $derived(type === 'changed')
const value = $derived(type === 'removed' ? before : after)
const summary = $derived(recordSummary(value, locale, id))
const rows = $derived(
  changeFields(before, value, fields, diff, comparison, copy.absent),
)
let expansion = $state<Record<string, boolean>>({})
const changedKeys = $derived(
  comparison
    ? [
        ...new Set(
          changeFields(before, value, fields, true, true, copy.absent).flatMap(field =>
            field.key === 'properties'
              ? (field.children ?? []).map(child => child.key)
              : [field.key],
          ),
        ),
      ]
    : [],
)
const expandable = $derived(expandableFields(rows))
const allExpanded = $derived(
  expandable.every(field => expansion[field.id] ?? field.expanded),
)
function toggleAll() {
  expansion = Object.fromEntries(expandable.map(field => [field.id, !allExpanded]))
}
const tones = {
  added: 'border-l-data-success text-data-success',
  changed: 'border-l-data-warning text-data-warning',
  removed: 'border-l-data-error text-data-error',
}
</script>

<article
  class={`overflow-hidden rounded-md border border-outline-variant border-l-4 bg-surface-container-lowest ${tones[type]}`}
>
  <header
    class="flex items-stretch gap-2 bg-surface-container-low pr-4 hover:bg-surface-container"
  >
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <Icon
        icon={expanded ? 'proicons:chevron-down' : 'proicons:chevron-right'}
        class="size-4 shrink-0"
      />
      <span class="min-w-0 flex-1">
        <span class="block break-words font-body text-body-md text-primary">
          {summary.name === id ? copy.record : summary.name}
        </span>
        <span
          class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground-alt"
        >
          {#if summary.detail}
            <span class="break-words font-body text-caption">{summary.detail}</span>
          {/if}
          {#if changedKeys.length}
            <span class="flex flex-wrap items-center gap-1.5">
              {#each changedKeys as key (key)}
                <FieldTag field={key} />
              {/each}
            </span>
          {/if}
        </span>
        <span class="sr-only">{copy[type]}</span>
      </span>
    </button>
    {#if expanded && expandable.length}
      <button
        type="button"
        class="my-auto flex size-8 shrink-0 items-center justify-center rounded text-foreground-alt hover:bg-surface-container-high hover:text-primary"
        aria-label={allExpanded ? copy.collapseAll : copy.expandAll}
        title={allExpanded ? copy.collapseAll : copy.expandAll}
        onclick={toggleAll}
      >
        <span class="flex flex-col" class:rotate-180={allExpanded}>
          <Icon icon="proicons:chevron-down" class="size-3.5" />
          <Icon icon="proicons:chevron-down" class="-mt-2 size-3.5" />
        </span>
      </button>
    {/if}
    <CopyId {id} {copy} />
  </header>
  {#if expanded}
    <div class="overflow-x-auto text-primary">
      <dl class={comparison ? 'min-w-160' : 'min-w-96'}>
        {#if comparison}
          <div
            class="grid grid-cols-[minmax(10rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant px-4 py-3 font-mono text-label-sm text-foreground-alt"
          >
            <dt>{copy.field}</dt>
            <dd>{copy.before}</dd>
            <dd>{copy.after}</dd>
          </div>
        {/if}
        {#each rows as field (field.key)}
          <NestedField
            {field}
            {comparison}
            {expansion}
            onExpansionChange={(id, value) => {
              expansion = { ...expansion, [id]: value }
            }}
          />
        {:else}
          <div class="px-4 py-3 text-body-sm text-foreground-alt">{copy.noFields}</div>
        {/each}
      </dl>
    </div>
  {/if}
</article>
