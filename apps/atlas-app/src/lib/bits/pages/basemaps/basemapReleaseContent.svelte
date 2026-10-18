<script lang="ts">
import {
  manifestChanges,
  manifestFields,
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
</script>
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
        <p class="px-5 pt-5 font-body text-label-md leading-6 text-foreground-alt">
          Build metadata and artefacts compared with the previous edition. Individual
          map-feature edits are not listed here.
        </p>
        <div class="mt-2 divide-y divide-data-outline-variant/40">
          {#each changes as change}
            <section class="px-5 py-5">
              <h3 class="font-body text-label-md font-semibold text-primary">
                {change.label}
              </h3>
              <dl class="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-8">
                <div class="min-w-0">
                  <dt class="font-body text-caption text-foreground-alt">Previous</dt>
                  <dd
                    class="mt-1 break-all font-mono text-label-md leading-6 text-foreground-alt"
                  >
                    {change.before}
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt class="font-body text-caption text-data-primary">Current</dt>
                  <dd
                    class="mt-1 break-all font-mono text-label-md leading-6 text-primary"
                  >
                    {change.after}
                  </dd>
                </div>
              </dl>
            </section>
          {:else}
            <p class="px-5 py-5 font-body text-label-md text-foreground-alt">
              No changes in the compared manifest fields.
            </p>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-5 font-body text-label-md leading-6 text-foreground-alt">
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
