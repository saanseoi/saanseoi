<script lang="ts">
import ReviewActionIcon from './ReviewActionIcon.svelte'
import type { Group, Table, Subset } from './types'
let {
  kind,
  group,
  table,
  groups,
  tables,
  limit,
  busy,
  onKind,
  onGroup,
  onTable,
  onLimit,
  onRefresh,
  subset,
  subsets,
  onSubset,
  onMove,
  approvalLabel,
}: {
  subset: string
  subsets: Subset[]
  onSubset: (value: string) => void
  onMove: (direction: number, level: 'group' | 'table' | 'view') => void
  approvalLabel: (table: string, subset: string) => string
  kind: string
  group: string
  table: string
  groups: Group[]
  tables: Table[]
  limit: number
  busy: boolean
  onKind: (value: string) => void
  onGroup: (value: string) => void
  onTable: (value: string) => void
  onLimit: (value: number) => void
  onRefresh: () => void
} = $props()
</script>

<section
  class="flex items-center gap-2 overflow-x-auto pb-1"
  aria-label="Review navigation"
>
  <select
    aria-label="Shard type"
    title="Shard type"
    class="h-9 w-28 shrink-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
    value={kind}
    onchange={e => onKind(e.currentTarget.value)}
  >
    {#each ['META', 'CURRENT', 'HISTORY', 'SOURCE'] as value}
      <option>{value}</option>
    {/each}
  </select>
  <select
    aria-label={kind === 'META'
      ? 'Table'
      : kind === 'SOURCE'
        ? 'Dataset'
        : 'Snapshot lineage'}
    title={kind === 'META'
      ? 'Table'
      : kind === 'SOURCE'
        ? 'Dataset'
        : 'Snapshot lineage'}
    class="h-9 min-w-48 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
    value={group}
    onchange={e => onGroup(e.currentTarget.value)}
    disabled={!groups.length}
  >
    {#if !group}
      <option value="" disabled>Select a group</option>
    {/if}
    {#each groups as item}
      <option value={item.id}>{item.label}</option>
    {/each}
  </select>
  {#if kind !== 'META'}
    <select
      aria-label="Data and supporting tables"
      title="Data and supporting tables"
      class="h-9 min-w-44 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
      value={table}
      onchange={e => onTable(e.currentTarget.value)}
      disabled={!tables.length}
    >
      {#each tables as item}
        <option value={item.name}>{item.name}{approvalLabel(item.name, '')}</option>
      {/each}
    </select>
  {/if}
  {#if subsets.length}
    <select
      aria-label="Review subset"
      title="Review subset"
      class="h-9 min-w-40 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
      value={subset}
      onchange={e => onSubset(e.currentTarget.value)}
    >
      <option value="">All rows{approvalLabel(table, '')}</option>
      {#each subsets as item}
        <option value={item.id}>{item.label}{approvalLabel(table, item.id)}</option>
      {/each}
    </select>
  {/if}
  <select
    aria-label="Samples"
    title="Sample count"
    class="h-9 w-28 shrink-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
    value={limit}
    onchange={e => onLimit(Number(e.currentTarget.value))}
  >
    {#each [4, 8, 12, 20, 30] as n}
      <option value={n}>{n} samples</option>
    {/each}
  </select>
  <button
    type="button"
    aria-label="Load different samples"
    title="Load different samples"
    class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container disabled:opacity-30"
    disabled={busy || !table}
    onclick={onRefresh}
  >
    <ReviewActionIcon kind="refresh" />
  </button>
  <div class="flex shrink-0 gap-1 border-l border-outline-variant pl-2">
    <button
      type="button"
      aria-label="Previous view"
      title="Previous unreviewed view"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(-1, 'view')}
    >
      <ReviewActionIcon kind="previous" />
    </button>
    <button
      type="button"
      aria-label="Next view"
      title="Next unreviewed view"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(1, 'view')}
    >
      <ReviewActionIcon kind="next" />
    </button>
  </div>
</section>
