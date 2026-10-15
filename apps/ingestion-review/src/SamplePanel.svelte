<script lang="ts">
import GroupedField from '../../atlas-app/src/lib/bits/pages/docs/components/releaseSamples/components/releaseSamplesGroupedField.svelte'
import {
  groupAddressSamples,
  toCompleteSample,
} from '../../atlas-app/src/lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation'
import type { Inspection } from './types'
let { data }: { data: Inspection } = $props()
let activeSampleIds = $state<string[] | null>(null)
let selectedSampleIds = $state<string[] | null>(null)
// Synthetic viewer IDs preserve duplicate physical rows and original record IDs.
const samples = $derived(
  data.samples.flatMap((sample, i) => {
    const value = toCompleteSample(
      {
        id: `${sample.shard} · sample ${i + 1}`,
        record: sample.record,
      },
      { markArrays: true },
    )
    return value ? [value] : []
  }),
)
const fields = $derived(groupAddressSamples(samples))
</script>
<section class="space-y-3" aria-label="Record samples">
  <div class="flex flex-wrap items-baseline justify-between gap-3">
    <h2 class="text-xl font-semibold">{data.table}</h2>
    <p class="text-sm">
      {samples.length}
      samples · hover or select values to follow a record
    </p>
  </div>
  <div class="flex flex-wrap gap-2 text-sm">
    {#each data.shards as shard}
      <span
        class="rounded border border-outline-variant px-3 py-2"
        title={shard.relation}
        >{shard.binding}</span
      >
    {/each}
  </div>
  {#each [...new Set(data.shards.map(s => s.relation))] as relation}
    <p class="text-sm text-foreground-alt">{relation}</p>
  {/each}
  {#if samples.length}
    <dl
      class="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
    >
      {#each fields as field (field.key)}
        <GroupedField
          {field}
          arrayInitialLimit={5}
          arrayPageSize={10}
          sampleIds={samples.map(s => s.id)}
          bind:activeSampleIds
          bind:selectedSampleIds
        />
      {/each}
    </dl>
  {:else}
    <p class="rounded-xl border border-outline-variant p-6">
      No rows found for this group and table in the available local shards.
    </p>
  {/if}
</section>
