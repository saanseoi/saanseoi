<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject } from './auditDivisionPresentation'
import { matchesAudit } from './auditSearch'
import Disclosure from './auditFixtureDisclosure.svelte'
let { entries, query = '' }: { entries: Json[]; query?: string } = $props()
let open = $state(false)
let results = $derived(
  entries.flatMap(entry => {
    const row = auditObject(entry)
    const rule = auditObject(row.ruleResult)
    return (Array.isArray(rule.records) ? rule.records : []).map(
      (record): Record<string, Json> => ({
        ...auditObject(record),
        locale: String(auditObject(row.definition).locale ?? ''),
      }),
    )
  }),
)
let visible = $derived(
  results.filter(
    record =>
      !query.trim() ||
      matchesAudit(
        query,
        record,
        'Name alias rules',
        entries.map(entry => auditObject(entry).definition),
      ),
  ),
)
let matched = $derived(
  entries.reduce<number>(
    (count, entry) =>
      count + Number(auditObject(auditObject(entry).ruleResult).matched ?? 0),
    0,
  ),
)
$effect(() => {
  open = Boolean(query.trim()) && visible.length > 0
})
</script>
<div class="border-t border-current/15">
  <Disclosure bind:open prominent>
    {#snippet summary()}
      Results
      <span class="ml-2 text-sm tabular-nums opacity-60"
        >{query.trim() ? `${visible.length} / ${results.length}` : results.length}</span
      >
    {/snippet}
    {#snippet children()}
      {#if visible.length}
        <table class="w-full border-collapse text-left text-sm">
          <thead
            class="sticky top-0 bg-background text-xs uppercase text-foreground/50"
          >
            <tr>
              <th class="py-3 pr-4 font-medium">Name</th>
              <th class="py-3 pr-4 font-medium">Alias</th>
              <th class="py-3 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {#each visible as record}
              <tr class="border-t border-current/10">
                <td
                  class="py-3 pr-4"
                  title={`Division ID: ${record.divisionId} · ${record.locale}`}
                >
                  {String(record.name ?? '')}
                </td>
                <td class="py-3 pr-4">{String(record.alias ?? '')}</td>
                <td class="py-3 text-xs">
                  <span class={record.changed ? 'text-emerald-500' : 'opacity-60'}
                    >{record.changed ? 'Added' : 'Unchanged'}</span
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="text-sm opacity-60">
          {query.trim()
            ? 'No matching results.'
            : 'Result records were not saved for this rule.'}
        </p>
      {/if}
      {#if !query.trim() && matched > results.length}
        <p class="mt-3 text-sm opacity-60">
          Some result records were not saved for this rule.
        </p>
      {/if}
    {/snippet}
  </Disclosure>
</div>
