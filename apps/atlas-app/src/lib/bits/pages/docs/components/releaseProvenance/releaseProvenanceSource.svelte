<script lang="ts">
import type { FieldRef, ReleaseBinding } from '@repo/db/fieldLineageTypes'
import type { HumanSourceUse } from '@repo/db/fieldLineageHuman'
import { useProvenanceSources } from './provenanceContext'
import Rule from './releaseProvenanceRule.svelte'
import { readablePath } from './presentation'
import { fieldName } from './humanPresentation'
let {
  input,
  scopeLabels,
  binding,
  uses = [],
}: {
  input: FieldRef
  scopeLabels: Record<string, string>
  binding: ReleaseBinding | null
  uses?: HumanSourceUse[]
} = $props()
const publishers: Record<string, string> = {
  'ds-hk-overture-division': 'Overture',
  'ds-hk-hkgov-landsd-division': 'LandsD',
  'ds-hk-protomaps-island': 'Protomaps',
}
const context = useProvenanceSources()
let sources = $derived(context()[input.scope] ?? [])
let published = $derived(sources.filter(source => source.role === 'published'))
let resourceType = $derived(published[0]?.resourceType)
let labelParts = $derived((scopeLabels[input.scope] ?? 'Source input').split(' · '))

let upstream = $derived(
  uses.flatMap(use =>
    sources
      .filter(
        source =>
          source.role === 'preprocessing' &&
          source.datasetCode === use.datasetCode &&
          (!use.resourceType || use.resourceType === source.resourceType),
      )
      .map(source => ({
        ...source,
        contribution: use.contribution,
        selection: use.selection,
      })),
  ),
)
let missingSources = $derived(
  uses.filter(
    use =>
      !upstream.some(
        source =>
          source.datasetCode === use.datasetCode &&
          (!use.resourceType || source.resourceType === use.resourceType),
      ),
  ),
)
</script>
{#if input.stage === 'audit'}
  <aside class="rounded-lg border border-secondary/20 p-3 text-xs">
    <p class="font-semibold">SaanSeoi curated instructions</p>
    <p class="mt-1 text-foreground/65">
      The matching SaanSeoi curated decisions can replace this field or the record
      supplying it. Their applicability is described in the preparation details.
    </p>
  </aside>
{:else if input.stage === 'registry' && input.collection === 'selectedGeometry'}
  <aside class="rounded-lg border border-foreground/15 p-3 text-xs">
    <p class="font-semibold">Release-selected {input.path}</p>
    <p class="mt-1 text-foreground/65">
      Use the related collection selected for this release and requested variant.
    </p>
  </aside>
{:else}
  <section
    class="space-y-3 text-xs [overflow-wrap:anywhere]"
    aria-label="Source releases"
  >
    <div class="rounded-lg border border-foreground/15 bg-foreground/5 p-3">
      <p class="font-semibold">
        {#each labelParts as part, index}
          {#if index > 0}
            <span class="mx-1">·</span>
          {/if}
          {#if resourceType && part === readablePath(resourceType)}
            <code>{resourceType}</code>
          {:else}
            {part}
          {/if}
        {/each}
      </p>
      {#if input.path !== '$'}
        <p class="mt-1 text-foreground/65">{fieldName(input.path)}</p>
      {/if}
      {#each published as source}
        <a
          class="mt-2 block font-mono text-secondary hover:underline underline-offset-4"
          href={`/sources/${source.datasetCode}/${source.releaseCode}`}
          >{source.releaseCode}</a
        >
      {:else}
        <p class="mt-2 text-foreground/60">Release identity unavailable.</p>
      {/each}
    </div>
    {#if upstream.length}
      <h5 class="font-semibold text-foreground/60">
        Source inputs used by these preparation rules
      </h5>
      <div class="ml-3 space-y-3 border-l border-secondary/30 pl-3">
        {#each upstream as source}
          <article class="rounded-lg border border-foreground/15 p-3">
            <p class="font-semibold">
              {publishers[source.datasetCode] ?? source.label ?? source.datasetCode}
              <span class="mx-1">·</span> <code>{source.resourceType}</code>
            </p>
            <p class="mt-1 leading-relaxed text-foreground/75">{source.contribution}</p>
            {#if source.selection}
              <div class="mt-2"><Rule rule={source.selection} /></div>
            {/if}
            <a
              class="mt-2 block font-mono text-secondary hover:underline underline-offset-4"
              href={`/sources/${source.datasetCode}/${source.releaseCode}`}
              >{source.releaseCode}</a
            >
          </article>
        {/each}
      </div>
    {/if}
    {#each missingSources as missing}
      <p class="text-foreground/65">
        Exact preprocessing release unavailable:
        {publishers[missing.datasetCode] ?? missing.datasetCode}{missing.resourceType
          ? ` · ${missing.resourceType}`
          : ''}.
      </p>
    {/each}
  </section>
{/if}
