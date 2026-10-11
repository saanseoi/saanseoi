<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject } from './auditDivisionPresentation'
import Value from './auditDivisionValue.svelte'
let { row }: { row: Record<string, Json> } = $props()
let comparison = $derived(auditObject(row.comparison))
let inputs = $derived(auditObject(row.inputs))
const labels: Record<string, string> = {
  overture: 'Overture Divisions',
  saanseoi: 'SaanSeoi curations',
  hkgovLandsd: 'LandsD Places',
  landsd: 'LandsD Places',
  protomaps: 'Protomap Islands',
}
</script>
<div class="space-y-2 rounded-lg border border-current/10 p-3 text-sm">
  {#if comparison.kind === 'overture' ||
    (!comparison.kind && row.operation === 'prepare')}
    <p class="font-medium">Overture source record → SaanSeoi Division</p>
    {#if comparison.releaseCode}
      <a
        class="block text-xs underline opacity-60"
        href={`/sources/${comparison.datasetCode}/${comparison.releaseCode}`}
        >{String(comparison.releaseCode)}</a
      >
    {/if}
    <p class="leading-relaxed opacity-65">
      Left: the Overture record with this Division’s ID. Right: the SaanSeoi Division
      produced by preprocessing, including the names, classifications and hierarchy
      selected for this edition.
    </p>
    {#if 'publisherHierarchy' in row}
      <p class="opacity-65">
        For hierarchy, the left column shows Overture’s original ancestry and the right
        shows SaanSeoi’s resulting ancestry. Other source fields and names are shown in
        SaanSeoi’s data format.
      </p>
    {:else}
      <p class="opacity-65">
        This audit did not save Overture’s original hierarchy, so only the resulting
        SaanSeoi hierarchy can be shown. This does not mean Overture had no hierarchy.
      </p>
    {/if}
  {:else}
    <p class="font-medium">SaanSeoi Division — source comparison unavailable</p>
    <p class="leading-relaxed opacity-65">
      The right column shows the Division produced by SaanSeoi preprocessing. This audit
      has no single source record to show on the left.
    </p>
  {/if}
  {#if Object.keys(inputs).length}
    <p class="text-xs opacity-60">
      Sources recorded for the resulting SaanSeoi Division
    </p>
    <div class="flex flex-wrap gap-2">
      {#each Object.keys(inputs) as publisher}
        <span class="rounded bg-current/5 px-2 py-1 text-xs"
          >{labels[publisher] ?? publisher}</span
        >
      {/each}
    </div>
    <details>
      <summary class="cursor-pointer text-xs opacity-50">
        Contributing source records
      </summary>
      <div class="mt-3"><Value value={inputs} /></div>
    </details>
  {:else}
    <p class="text-xs opacity-50">
      This audit also lacks the list of source records used to produce this Division.
    </p>
  {/if}
</div>
