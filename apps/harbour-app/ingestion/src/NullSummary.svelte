<script lang="ts">
import type { Inspection } from './types'
let {
  data,
  loading,
  error,
}: { data: Inspection | null; loading: boolean; error: string } = $props()
let sort = $state('nulls-desc')
const columns = $derived(
  [...(data?.columns ?? [])].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : sort === 'nulls-asc'
        ? a.nulls - b.nulls
        : b.nulls - a.nulls,
  ),
)
</script>
<section class="space-y-3" aria-label="Null value summary">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-xl font-semibold">Column null summary</h2>
    <label class="text-sm"
      >Sort columns
      <select
        class="ml-2 rounded border border-outline-variant bg-surface p-2"
        bind:value={sort}
      >
        <option value="nulls-desc">Most nulls first</option>
        <option value="nulls-asc">Fewest nulls first</option>
        <option value="name">Column name</option>
      </select></label
    >
  </div>
  <p class="text-sm">
    SQL NULL counts across every matching row in all available physical shards,
    including duplicate rows across shards. JSON nulls and empty strings are separate
    values. Shared / unscoped tables count the whole table.
  </p>
  {#if loading}
    <p role="status">Counting all matching rows…</p>
  {:else if error}
    <p role="alert" class="text-red-700 dark:text-red-400">{error}</p>
  {:else if data}
    <details class="rounded border border-outline-variant p-3">
      <summary class="cursor-pointer">Stored schema by physical shard</summary>
      {#each data.schemas as schema}
        <h3 class="mt-3 font-semibold">{schema.binding}</h3>
        <pre
          class="overflow-x-auto py-2 text-xs"
        >{JSON.stringify(schema.columns, null, 2)}</pre>
      {/each}
    </details>
    <p class="text-sm">
      {data.shards
        .map(s => `${s.binding}: ${(s.count ?? 0).toLocaleString()} rows`)
        .join(' · ')}
    </p>
    <div class="overflow-x-auto rounded-xl border border-outline-variant">
      <table class="w-full text-left text-sm">
        <thead class="bg-surface-container">
          <tr>
            {#each [
              'Column',
              'SQLite type',
              'Required',
              'Primary key',
              'Nulls',
              'Rows',
              'Null %',
            ] as title}
              <th class="p-3">{title}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each columns as column}
            <tr class="border-t border-outline-variant">
              <td class="p-3 font-mono">{column.name}</td>
              <td class="p-3">{column.type}</td>
              <td class="p-3">{column.notnull ? 'Yes' : 'No'}</td>
              <td class="p-3">{column.pk ? column.pk : '—'}</td>
              <td class="p-3 tabular-nums">{column.nulls.toLocaleString()}</td>
              <td class="p-3 tabular-nums">{column.rows.toLocaleString()}</td>
              <td class="p-3 tabular-nums">
                {column.rows
                  ? `${((100 * column.nulls) / column.rows).toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
