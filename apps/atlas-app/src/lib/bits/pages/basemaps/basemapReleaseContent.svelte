<script lang="ts">
import {
  manifestChanges,
  manifestFields,
  type BasemapManifest,
} from '#lib/registry/basemapRelease.js'
import { browser } from '$app/env'
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
</script>
<section class="min-w-0 pt-4 pb-6 lg:pt-0">
  {#if activeTab === 'changes'}
    <h2 class="font-display text-headline-sm font-bold text-primary">
      Changes since the previous release
    </h2>
    {#if previous}
      <p class="mt-3 font-body text-body-md text-foreground-alt">
        {previous.release.version}
        → {current.release.version}. Manifest metadata and artefact changes; these do
        not represent individual map-feature edits.
      </p>
      <div class="mt-6 space-y-5">
        {#each changes as change}
          <section class="rounded-lg border border-outline-variant p-4">
            <h3 class="font-body text-label-md font-semibold text-primary">
              {change.label}
            </h3>
            <dl class="mt-3 grid gap-4 md:grid-cols-2">
              <div class="min-w-0">
                <dt class="text-caption text-foreground-alt">Previous</dt>
                <dd class="mt-1 break-all font-mono text-sm text-foreground-alt">
                  {change.before}
                </dd>
              </div>
              <div class="min-w-0">
                <dt class="text-caption text-secondary">Current</dt>
                <dd class="mt-1 break-all font-mono text-sm text-primary">
                  {change.after}
                </dd>
              </div>
            </dl>
          </section>
        {:else}
          <p class="text-foreground-alt">No changes in the compared manifest fields.</p>
        {/each}
      </div>
    {:else}
      <p class="mt-4 text-foreground-alt">
        {!catalogueAvailable
          ? 'The version catalogue is unavailable; the previous release cannot be determined.'
          : previousVersion
            ? `The manifest for ${previousVersion} is unavailable. Comparison could not be loaded.`
            : 'This is the earliest published release. There is no previous release to compare.'}
      </p>
    {/if}
  {:else if activeTab === 'stats'}
    <Stats {current} {statistics} />
  {:else if activeTab === 'map'}
    {#key `${current.region.code}/${current.release.version}`}
      {#if browser}
        {#await import('./basemapReleaseMap.svelte') then module}
          <module.default manifest={current} />
        {/await}
      {/if}
    {/key}
  {:else}
    <Fields rows={manifestFields(current)} />
  {/if}
</section>
