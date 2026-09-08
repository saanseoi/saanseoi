<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { AuditManifest, Json } from '@repo/core/provenance'
import { getRetainedBulkFixture } from '#lib/registry/audit.remote.js'
import RetainedAuditFixture from './retainedAuditFixture.svelte'
import Translations from './retainedAuditTranslations.svelte'
let {
  manifest,
  hash,
  query = '',
  translations = true,
}: {
  manifest: AuditManifest
  hash: string
  query?: string
  translations?: boolean
} = $props()
let documents = $state<Record<number, Json>>({})
let failure = $state('')
async function load(index: number) {
  try {
    documents[index] = await getRetainedBulkFixture({
      releaseId: manifest.releaseId,
      hash,
      bulkId: 'individual-fixtures',
      index,
    })
    failure = ''
  } catch {
    failure = m.source_audit_load_fixture_error()
  }
}
</script>

{#each manifest.individualFixtures ?? [] as fixture, index}
  {#if fixture.type.includes('translation') === translations}
    <details
      class="rounded-lg border border-current/15 p-3"
      ontoggle={event => { if (event.currentTarget.open && documents[index] === undefined) void load(index) }}
    >
      <summary class="cursor-pointer text-sm font-medium">
        {fixture.type.replaceAll('-', ' ')}
        · {m.source_audit_part({ index: index + 1 })}
      </summary>
      <div class="pt-3">
        {#if documents[index] !== undefined}
          {@const document = documents[index]}
          {#if translations && document && typeof document === 'object' && !Array.isArray(document) && Array.isArray(document.entries)}
            <Translations
              entries={document.entries}
              releaseId={manifest.releaseId}
              {hash}
              fixtureIndex={index}
              {query}
            />
          {:else}
            <RetainedAuditFixture value={document ?? null} />
          {/if}
        {:else}
          <p class="text-sm">{failure || m.source_audit_loading_fixture()}</p>
          {#if failure}
            <button type="button" class="text-sm underline" onclick={() => load(index)}>
              {m.source_audit_retry_fixture()}
            </button>
          {/if}
        {/if}
      </div>
    </details>
  {/if}
{/each}
