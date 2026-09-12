<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { AuditManifest, Json } from '@repo/core/provenance'
import { getRetainedBulkFixture } from '#lib/registry/audit.remote.js'
import Translations from './auditTranslations.svelte'
let {
  manifest,
  hash,
  query,
}: { manifest: AuditManifest; hash: string; query: string } = $props()
let entries = $state<Json[]>([])
let references = $state<Array<{ fixtureIndex: number; entryIndex: number }>>([])
let loading = $state(true)
let failure = $state('')
let generation = 0
async function load() {
  const request = ++generation
  loading = true
  try {
    const parts = await Promise.all(
      (manifest.individualFixtures ?? []).flatMap((fixture, fixtureIndex) =>
        fixture.type.includes('translation')
          ? [
              getRetainedBulkFixture({
                releaseId: manifest.releaseId,
                hash,
                bulkId: 'individual-fixtures',
                index: fixtureIndex,
              }).then(document => {
                if (
                  !document ||
                  typeof document !== 'object' ||
                  Array.isArray(document) ||
                  !Array.isArray(document.entries)
                )
                  throw new Error(m.source_audit_invalid_translation_fixture())
                return document.entries.map((entry, entryIndex) => ({
                  entry,
                  fixtureIndex,
                  entryIndex,
                }))
              }),
            ]
          : [],
      ),
    )
    if (request !== generation) return
    entries = parts.flat().map(row => row.entry)
    references = parts
      .flat()
      .map(({ fixtureIndex, entryIndex }) => ({ fixtureIndex, entryIndex }))
    failure = ''
  } catch {
    if (request === generation) failure = m.source_audit_load_translations_error()
  } finally {
    if (request === generation) loading = false
  }
}
$effect(() => {
  manifest
  hash
  void load()
})
</script>
{#if failure}
  <p role="alert">{failure}</p>
  <button type="button" class="text-sm underline" onclick={load}>
    {m.source_audit_retry_translations()}
  </button>
{:else if loading}
  <p role="status" class="text-sm opacity-60">
    {m.source_audit_loading_translations()}
  </p>
{:else}
  <Translations
    {entries}
    {references}
    releaseId={manifest.releaseId}
    {hash}
    {query}
    showHeader
  />
{/if}
