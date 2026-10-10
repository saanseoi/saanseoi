<script lang="ts">
import type { AuditManifest } from '@repo/core/provenance'
import { getAuditFixtureCatalogue } from '#lib/registry/audit.remote.js'
import type { FixtureCatalogue } from './auditFixtureCatalogue'
import { provideLoadedFixtures } from './auditLoadedFixtures'
import Bulk from './auditBulk.svelte'
let {
  manifest,
  hash,
  releaseCode,
  query = '',
}: {
  manifest: AuditManifest
  hash: string
  releaseCode: string
  query?: string
} = $props()
provideLoadedFixtures()
let bulk = $derived(
  manifest.bulk.find(rule => rule.id === 'prepare-curated-division-edition'),
)
let catalogue = $state<FixtureCatalogue>()
$effect(() => {
  let active = true
  getAuditFixtureCatalogue({
    resourceReleaseId: manifest.resourceReleaseId,
    hash,
    releaseCode,
  })
    .then(value => {
      if (active) catalogue = value
    })
    .catch(() => {})
  return () => {
    active = false
  }
})
</script>
{#if bulk}
  <Bulk
    {bulk}
    resourceReleaseId={manifest.resourceReleaseId}
    {hash}
    {query}
    groups={catalogue?.groups[bulk.id]}
    fixtureTypes={['prepared-division-changes']}
    presentationTitle="Preparation summary"
  />
{/if}
