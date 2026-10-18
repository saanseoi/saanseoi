<script lang="ts">
import Section from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSection.svelte'
import Header from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSectionHeader.svelte'
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
<div class="space-y-6">
  {#if statistics}
    <Section>
      <Header eyebrow="OpenStreetMap source" title="Inside this basemap" />
      <dl
        class="grid grid-cols-1 divide-y divide-data-outline-variant/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
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
          <div class="px-5 py-5">
            <dt class="font-body text-caption text-foreground-alt">{metric.label}</dt>
            <dd
              class="mt-2 font-mono text-headline-md font-semibold tabular-nums text-primary"
            >
              {metric.value}
            </dd>
          </div>
        {/each}
      </dl>
      <div class="border-t border-data-outline-variant/40 px-5 py-5">
        <div
          class="grid grid-cols-[minmax(0,1fr)_minmax(2rem,1fr)_max-content] items-center gap-x-4 gap-y-4"
        >
          {#each counts as row}
            <p class="font-body text-label-md text-foreground-alt">{row.label}</p>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-data-surface-container-high"
              aria-hidden="true"
            >
              <div
                class="h-full rounded-full bg-data-primary/55"
                style:width={`${(row.value / maxCount) * 100}%`}
              ></div>
            </div>
            <p class="text-right font-mono text-label-md tabular-nums text-primary">
              {row.value.toLocaleString('en-GB')}
            </p>
          {/each}
        </div>
        <p class="mt-5 max-w-2xl font-body text-caption leading-6 text-foreground-alt">
          OSM objects before clipping and simplification. Categories can overlap;
          complete ways can extend beyond the regional boundary.
        </p>
      </div>
    </Section>
  {/if}
  <Section>
    <Header eyebrow="Artefacts" title="Archive & source sizes" />
    <p class="px-5 pt-5 font-body text-label-md leading-6 text-foreground-alt">
      The source archive covers Guangdong; the other artefacts cover this region.
    </p>
    <div class="space-y-5 px-5 py-5">
      {#each sizes as row}
        <div>
          <div class="mb-2 flex justify-between gap-4 font-body text-label-md">
            <span class="text-foreground-alt">{row.label}</span>
            <span class="shrink-0 font-mono tabular-nums text-primary"
              >{(row.value / 1_000_000).toFixed(2)}
              MB</span
            >
          </div>
          <div
            class="h-1.5 overflow-hidden rounded-full bg-data-surface-container-high"
            aria-hidden="true"
          >
            <div
              class="h-full min-w-px rounded-full bg-data-primary/55"
              style:width={`${(row.value / maxSize) * 100}%`}
            ></div>
          </div>
        </div>
      {/each}
    </div>
    {#if statistics}
      <details
        class="border-t border-data-outline-variant/40 px-5 py-4 font-body text-caption text-foreground-alt"
      >
        <summary
          class="w-fit cursor-pointer hover:text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
        >
          How these counts were calculated
        </summary>
        <p class="mt-3 max-w-2xl leading-6">
          Archived source and boundary verified by SHA-256. Objects were extracted with
          complete ways and counted once per category. Counts describe OSM objects,
          rather than rendered symbols or unique real-world buildings. Roads and
          railways count ways; buildings count ways and relations. Points of interest
          include amenity, shop, tourism and leisure tags.
        </p>
        <dl class="mt-4 space-y-3">
          {#each [
            { label: 'Source SHA-256', value: statistics.sourceSha256 },
            { label: 'Boundary SHA-256', value: statistics.boundarySha256 },
            { label: 'Method', value: statistics.method },
          ] as row}
            <div>
              <dt>{row.label}</dt>
              <dd class="mt-1 break-all font-mono leading-6">{row.value}</dd>
            </div>
          {/each}
        </dl>
      </details>
    {:else}
      <p class="px-5 pb-5 font-body text-caption text-foreground-alt">
        Source-feature statistics have not been published for this release.
      </p>
    {/if}
  </Section>
</div>
