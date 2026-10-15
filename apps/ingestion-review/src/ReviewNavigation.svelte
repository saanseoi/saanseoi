<script lang="ts">
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
const groupIndex = $derived(groups.findIndex(g => g.id === group))
const tableIndex = $derived(tables.findIndex(t => t.name === table))
</script>
<section
  class="space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
  aria-label="Review navigation"
>
  <div class="flex flex-wrap items-end gap-4">
    <label class="grid gap-1 text-sm"
      >Shard type
      <select
        class="rounded border border-outline-variant bg-surface p-2"
        value={kind}
        onchange={e => onKind(e.currentTarget.value)}
      >
        {#each ['META', 'CURRENT', 'HISTORY', 'SOURCE'] as value}
          <option>{value}</option>
        {/each}
      </select>
    </label>
    <label class="grid min-w-0 flex-1 gap-1 text-sm"
      >{kind === 'META'
        ? 'Table'
        : kind === 'SOURCE'
          ? 'Resource release'
          : 'Snapshot lineage'}
      <select
        class="w-full min-w-0 rounded border border-outline-variant bg-surface p-2"
        value={group}
        onchange={e => onGroup(e.currentTarget.value)}
        disabled={!groups.length}
      >
        {#if !group}
          <option value="" disabled>Select a group to review</option>
        {/if}
        {#each groups as item}
          <option value={item.id}>{item.label}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
      disabled={groupIndex <= 0}
      onclick={() => onMove(-1, 'group')}
    >
      Previous group
    </button>
    <button
      type="button"
      class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
      disabled={groupIndex < 0 || groupIndex >= groups.length - 1}
      onclick={() => onMove(1, 'group')}
    >
      Next group
    </button>
  </div>
  {#if kind !== 'META'}
    <div class="flex flex-wrap items-end gap-4">
      <label class="grid min-w-0 flex-1 gap-1 text-sm"
        >Data and supporting tables
        <select
          class="w-full min-w-0 rounded border border-outline-variant bg-surface p-2"
          value={table}
          onchange={e => onTable(e.currentTarget.value)}
          disabled={!tables.length}
        >
          {#each tables as item}
            <option value={item.name}>
              {item.name}{approvalLabel(item.name, '')}
              — {item.shards.length} populated shards · {item.relation}
            </option>
          {/each}
        </select>
      </label>
      <button
        type="button"
        class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
        disabled={tableIndex <= 0}
        onclick={() => onMove(-1, 'table')}
      >
        Previous table
      </button>
      <button
        type="button"
        class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
        disabled={tableIndex < 0 || tableIndex >= tables.length - 1}
        onclick={() => onMove(1, 'table')}
      >
        Next table
      </button>
    </div>
  {/if}
  {#if subsets.length}
    <label class="grid gap-1 text-sm"
      >Review subset
      <select
        class="w-full min-w-0 rounded border border-outline-variant bg-surface p-2"
        value={subset}
        onchange={e => onSubset(e.currentTarget.value)}
      >
        <option value="">All matching rows{approvalLabel(table, '')}</option>
        {#each subsets as item}
          <option value={item.id}>
            {item.label}
            · {item.count.toLocaleString()} rows{approvalLabel(table, item.id)}
          </option>
        {/each}
      </select>
    </label>
  {/if}
  <div class="flex flex-wrap items-center gap-4 text-sm">
    <label
      >Samples
      <select
        class="ml-2 rounded border border-outline-variant bg-surface p-2"
        value={limit}
        onchange={e => onLimit(Number(e.currentTarget.value))}
      >
        {#each [4, 8, 12, 20, 30] as n}
          <option value={n}>{n}</option>
        {/each}
      </select></label
    >
    <button
      type="button"
      class="rounded bg-primary px-4 py-2 text-surface disabled:opacity-40"
      disabled={busy || !table}
      onclick={onRefresh}
    >
      Load different samples
    </button>
    <span
      >{groupIndex + 1}
      / {groups.length} groups{kind !== 'META'
        ? ` · ${tableIndex + 1} / ${tables.length} tables`
        : ''}</span
    >
    <button
      type="button"
      class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(-1, 'view')}
    >
      Previous view
    </button>
    <button
      type="button"
      class="rounded border border-outline-variant px-3 py-2 disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(1, 'view')}
    >
      Next view
    </button>
  </div>
</section>
