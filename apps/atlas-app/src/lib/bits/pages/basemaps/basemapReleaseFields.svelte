<script lang="ts">
import Section from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSection.svelte'
import Header from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSectionHeader.svelte'
import type { ManifestField } from '#lib/registry/basemapRelease.js'
let { rows }: { rows: ManifestField[] } = $props()
let details = $derived(rows.filter(row => !/SHA-256|commit/.test(row.label)))
let checksums = $derived(rows.filter(row => /SHA-256|commit/.test(row.label)))
</script>
<Section>
  <Header eyebrow="Release manifest" title="Build & source" />
  <dl class="divide-y divide-data-outline-variant/30 px-5">
    {#each details as row}
      <div class="grid gap-1.5 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
        <dt class="font-body text-label-md text-foreground-alt">{row.label}</dt>
        <dd
          class="min-w-0 font-body text-label-md leading-6 text-primary wrap-anywhere"
        >
          {row.value}
        </dd>
      </div>
    {/each}
  </dl>
  {#if checksums.length}
    <details class="border-t border-data-outline-variant/40 px-5 py-4">
      <summary
        class="w-fit cursor-pointer font-body text-label-md text-foreground-alt hover:text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
      >
        Checksums &amp; source revisions
      </summary>
      <dl class="mt-4 space-y-4">
        {#each checksums as row}
          <div>
            <dt class="font-body text-caption text-foreground-alt">{row.label}</dt>
            <dd
              class="mt-1 break-all font-mono text-label-md leading-6 text-foreground-alt"
            >
              {row.value}
            </dd>
          </div>
        {/each}
      </dl>
    </details>
  {/if}
</Section>
