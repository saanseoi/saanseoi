<script lang="ts">
import type { metaBasemapReleaseStats } from '@repo/db'
import { manifestStats, type BasemapManifest } from '#lib/registry/basemapRelease.js'
let {
  current,
  statistics,
}: {
  current: BasemapManifest
  statistics: typeof metaBasemapReleaseStats.$inferSelect.statistics | null
} = $props()
const labels: Record<string, string> = {
  buildings: 'Buildings',
  roadsPaths: 'Roads & paths',
  railways: 'Railways',
  pois: 'Points of interest',
  landuse: 'Land use & natural features',
  waterways: 'Waterways',
  places: 'Places',
}
let sizes = $derived(
  manifestStats(current).map(row => ({ label: row.label, value: Number(row.value) })),
)
let maxSize = $derived(Math.max(...sizes.map(row => row.value), 1))
let counts = $derived(
  Object.entries(statistics?.counts ?? {}).map(([key, value]) => ({
    label: labels[key] ?? key,
    value,
  })),
)
let maxCount = $derived(Math.max(...counts.map(row => row.value), 1))
</script>
<div class="space-y-8">
  {#if statistics}
    <section>
      <h2 class="font-display text-headline-sm font-bold text-primary">
        Inside this basemap
      </h2>
      <p class="mt-2 font-body text-body-md text-foreground-alt">
        Features in the archived OpenStreetMap source for {current.region.description}.
      </p>
      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        {#each [
          { label: 'Map layers', value: statistics.layers.length },
          {
            label: 'Zoom levels',
            value: `${statistics.minZoom}–${statistics.maxZoom}`,
          },
          {
            label: 'Addressed tiles',
            value: statistics.addressedTiles.toLocaleString('en-GB'),
          },
        ] as metric}
          <div
            class="rounded-lg border border-outline-variant bg-surface-container-low p-5"
          >
            <p class="font-body text-label-md text-foreground-alt">{metric.label}</p>
            <p class="mt-2 font-mono text-headline-md font-bold text-secondary">
              {metric.value}
            </p>
          </div>
        {/each}
      </div>
      <div class="mt-5 space-y-4 rounded-lg border border-outline-variant p-5">
        {#each counts as row}
          <div>
            <div class="mb-2 flex justify-between gap-4 font-body text-label-md">
              <span class="text-primary">{row.label}</span
              ><span class="font-mono text-secondary"
                >{row.value.toLocaleString('en-GB')}</span
              >
            </div>
            <div class="h-3 rounded-full bg-surface-container-high" aria-hidden="true">
              <div
                class="h-full rounded-full bg-secondary"
                style:width={`${(row.value / maxCount) * 100}%`}
              ></div>
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-3 font-body text-caption leading-6 text-foreground-alt">
        Counts are OSM objects, before tile clipping and zoom simplification. Roads and
        railways count ways; buildings count ways and relations. Points of interest
        include amenity, shop, tourism and leisure tags. Categories can overlap, and
        complete ways can extend beyond the regional boundary.
      </p>
    </section>
  {/if}
  <section>
    <h2 class="font-display text-headline-sm font-bold text-primary">
      Archive & source sizes
    </h2>
    <p class="mt-2 font-body text-body-md text-foreground-alt">
      Compare the map archive and its input artefacts. The source archive covers
      Guangdong.
    </p>
    <div class="mt-5 space-y-5 rounded-lg border border-outline-variant p-5">
      {#each sizes as row}
        <div>
          <div class="mb-2 flex justify-between gap-4 font-body text-label-md">
            <span class="text-primary">{row.label}</span
            ><span class="shrink-0 font-mono text-primary"
              >{(row.value / 1_000_000).toFixed(2)}
              MB</span
            >
          </div>
          <div class="h-4 rounded-full bg-surface-container-high" aria-hidden="true">
            <div
              class="h-full min-w-px rounded-full bg-secondary/70"
              style:width={`${(row.value / maxSize) * 100}%`}
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </section>
  {#if statistics}
    <details
      class="rounded-lg border border-outline-variant p-5 font-body text-label-md text-foreground-alt"
    >
      <summary class="cursor-pointer font-semibold text-primary">
        How these counts were calculated
      </summary>
      <p class="mt-3 leading-6">
        The archived source and release boundary were verified by SHA-256. OSM objects
        were extracted with complete ways and counted once per category. These are
        source-object counts, not counts of rendered symbols or unique real-world
        buildings.
      </p>
      <dl class="mt-4 space-y-3 break-all font-mono text-caption">
        <dt>Source SHA-256</dt>
        <dd>{statistics.sourceSha256}</dd>
        <dt>Boundary SHA-256</dt>
        <dd>{statistics.boundarySha256}</dd>
        <dt>Method</dt>
        <dd>{statistics.method}</dd>
      </dl>
    </details>
  {:else}
    <p class="font-body text-body-md text-foreground-alt">
      Source-feature statistics have not been published for this release.
    </p>
  {/if}
</div>
