<script lang="ts">
import {
  manifestChanges,
  manifestFields,
  manifestStats,
  type BasemapManifest,
} from '#lib/registry/basemapRelease.js'
import { browser } from '$app/env'
import Section from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSection.svelte'
import Header from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSectionHeader.svelte'
import Stats from './basemapReleaseStats.svelte'
import type { metaBasemapReleaseStats } from '@repo/db'
import Fields from './basemapReleaseFields.svelte'
let {
  statistics,
  current,
  previous,
  previousVersion,
  catalogueAvailable,
  activeTab,
}: {
  statistics: typeof metaBasemapReleaseStats.$inferSelect.statistics | null
  current: BasemapManifest
  previous: BasemapManifest | null
  previousVersion: string | null
  catalogueAvailable: boolean
  activeTab: string
} = $props()
let changes = $derived(previous ? manifestChanges(previous, current) : [])
let metadataChanges = $derived(
  changes.filter(change => !/SHA-256|commit/.test(change.label)),
)
let checksumChanges = $derived(
  changes.filter(change => /SHA-256|commit/.test(change.label)),
)
let sizeLabels = $derived(new Set(manifestStats(current).map(row => row.label)))

/** Format archive sizes consistently while retaining exact values in the cell title. */
function changeValue(label: string, value: string, other: string): string {
  if (!sizeLabels.has(label) || !Number.isFinite(Number(value))) return value
  const scale = Math.max(Number(value), Number(other)) >= 1_000_000 ? 1_000_000 : 1_000
  const unit = scale === 1_000_000 ? 'MB' : 'KB'
  const formatted = (Number(value) / scale).toFixed(2)
  // Keep small real changes visible when rounded display values would be identical.
  return value !== other && formatted === (Number(other) / scale).toFixed(2)
    ? `${Number(value).toLocaleString('en-GB')} B`
    : `${formatted} ${unit}`
}
</script>
{#snippet comparison(rows: ReturnType<typeof manifestChanges>)}
  <div class="overflow-x-auto">
    <table class="w-full table-fixed text-left">
      <thead class="font-body text-caption text-foreground-alt">
        <tr class="border-data-outline-variant/40 border-b">
          <th scope="col" class="w-1/3 px-5 py-3 font-normal sm:w-1/4">Field</th>
          <th scope="col" class="px-3 py-3 font-normal">Previous</th>
          <th scope="col" class="px-3 py-3 pr-5 font-normal">Current</th>
        </tr>
      </thead>
      <tbody class="divide-data-outline-variant/30 divide-y">
        {#each rows as change}
          <tr class="align-top">
            <th
              scope="row"
              class="font-body text-label-md text-foreground-alt px-5 py-3 font-normal wrap-anywhere"
            >
              {change.label}
            </th>
            <td
              class="text-caption text-foreground-alt px-3 py-3 font-mono leading-6 wrap-anywhere"
              title={change.before}
            >
              {changeValue(change.label, change.before, change.after)}
            </td>
            <td
              class="text-caption text-primary px-3 py-3 pr-5 font-mono leading-6 wrap-anywhere"
              title={change.after}
            >
              {changeValue(change.label, change.after, change.before)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}
<section class="min-w-0 pt-4 pb-6 lg:pt-0">
  {#if activeTab === 'changes'}
    <Section>
      <Header
        eyebrow={previous
          ? `${previous.release.version} → ${current.release.version}`
          : 'Release comparison'}
        title="What changed"
      />
      {#if previous}
        {#if metadataChanges.length}
          {@render comparison(metadataChanges)}
        {:else}
          <p class="font-body text-label-md text-foreground-alt px-5 py-4">
            {checksumChanges.length
              ? 'Only checksums and source revisions changed.'
              : 'No build metadata changes.'}
          </p>
        {/if}
        {#if checksumChanges.length}
          <details class="border-data-outline-variant/40 border-t">
            <summary
              class="font-body text-caption text-foreground-alt hover:text-primary focus-visible:outline-data-primary cursor-pointer px-5 py-4 focus-visible:outline-2"
            >
              Checksums &amp; revisions
              <span class="ml-1 font-mono">({checksumChanges.length})</span>
            </summary>
            {@render comparison(checksumChanges)}
          </details>
        {/if}
        <p
          class="border-data-outline-variant/30 font-body text-caption text-foreground-alt border-t px-5 py-3"
        >
          Build metadata only; individual map-feature edits are not compared.
        </p>
      {:else}
        <p class="font-body text-label-md text-foreground-alt px-5 py-5 leading-6">
          {!catalogueAvailable
            ? 'The version catalogue is unavailable; the previous release cannot be determined.'
            : previousVersion
              ? `The manifest for ${previousVersion} is unavailable. Comparison could not be loaded.`
              : 'This is the earliest published release. There is no previous release to compare.'}
        </p>
      {/if}
    </Section>
  {:else if activeTab === 'stats'}
    <Stats {current} {statistics} />
  {:else if activeTab === 'map'}
    {#key `${current.region.code}/${current.release.version}`}
      {#if browser}
        {#await import('./basemapReleaseMap.svelte') then module}
          <Section>
            <Header eyebrow="Map preview" title={current.region.description} />
            <module.default manifest={current} />
          </Section>
        {/await}
      {/if}
    {/key}
  {:else}
    <Fields rows={manifestFields(current)} />
  {/if}
</section>
