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
const groupIndex = $derived(groups.findIndex(g => g.id === group))
const tableIndex = $derived(tables.findIndex(t => t.name === table))
</script>
<section class="space-y-3" aria-label="Review navigation">
  <div class="grid grid-cols-[6rem_minmax(0,1fr)_2.25rem_2.25rem] items-end gap-2">
    <label class="grid gap-1 text-xs font-medium text-foreground-alt"
      >Shard type
      <select
        class="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-foreground"
        value={kind}
        onchange={e => onKind(e.currentTarget.value)}
      >
        {#each ['META', 'CURRENT', 'HISTORY', 'SOURCE'] as value}
          <option>{value}</option>
        {/each}
      </select>
    </label>
    <label class="grid min-w-0 flex-1 gap-1 text-xs font-medium text-foreground-alt"
      >{kind === 'META'
        ? 'Table'
        : kind === 'SOURCE'
          ? 'Resource release'
          : 'Snapshot lineage'}
      <select
        class="w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-foreground"
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
      aria-label="Previous group"
      title="Previous group"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
      disabled={groupIndex <= 0}
      onclick={() => onMove(-1, 'group')}
    >
      <ReviewActionIcon kind="previous" />
    </button>
    <button
      type="button"
      aria-label="Next group"
      title="Next group"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
      disabled={groupIndex < 0 || groupIndex >= groups.length - 1}
      onclick={() => onMove(1, 'group')}
    >
      <ReviewActionIcon kind="next" />
    </button>
  </div>
  {#if kind !== 'META'}
    <div class="grid grid-cols-[minmax(0,1fr)_2.25rem_2.25rem] items-end gap-2">
      <label class="grid min-w-0 flex-1 gap-1 text-xs font-medium text-foreground-alt"
        >Data and supporting tables
        <select
          class="w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-foreground"
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
        aria-label="Previous table"
        title="Previous table"
        class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
        disabled={tableIndex <= 0}
        onclick={() => onMove(-1, 'table')}
      >
        <ReviewActionIcon kind="previous" />
      </button>
      <button
        type="button"
        aria-label="Next table"
        title="Next table"
        class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
        disabled={tableIndex < 0 || tableIndex >= tables.length - 1}
        onclick={() => onMove(1, 'table')}
      >
        <ReviewActionIcon kind="next" />
      </button>
    </div>
  {/if}
  {#if subsets.length}
    <label class="grid gap-1 text-xs font-medium text-foreground-alt"
      >Review subset
      <select
        class="w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-foreground"
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
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <label
      >Samples
      <select
        class="ml-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-foreground"
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
      class="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-surface disabled:opacity-40"
      disabled={busy || !table}
      aria-label="Load different samples"
      title="Load different samples"
      onclick={onRefresh}
    >
      <ReviewActionIcon kind="refresh" />
      <span>Resample</span>
    </button>
    <span class="ml-auto px-2 text-xs tabular-nums text-foreground-alt"
      >{groupIndex + 1}
      / {groups.length} groups{kind !== 'META'
        ? ` · ${tableIndex + 1} / ${tables.length} tables`
        : ''}</span
    >
    <button
      type="button"
      aria-label="Previous view"
      title="Previous view"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(-1, 'view')}
    >
      <ReviewActionIcon kind="previous" />
    </button>
    <button
      type="button"
      aria-label="Next view"
      title="Next view"
      class="flex size-9 items-center justify-center rounded-lg border border-outline-variant text-foreground transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
      disabled={busy || !table}
      onclick={() => onMove(1, 'view')}
    >
      <ReviewActionIcon kind="next" />
    </button>
  </div>
</section>
