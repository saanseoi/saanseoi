<script lang="ts">
import type { AuditManifest, Json } from '@repo/core/provenance'
import { getRetainedBulkFixture } from '#lib/registry/audit.remote.js'
import RetainedAuditFixture from './retainedAuditFixture.svelte'
let { manifest, hash }: { manifest: AuditManifest; hash: string } = $props()
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
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
}
</script>

{#each manifest.individualFixtures ?? [] as fixture, index}
  <details
    class="rounded-lg border border-current/15 p-3"
    ontoggle={event => { if (event.currentTarget.open && documents[index] === undefined) void load(index) }}
  >
    <summary class="cursor-pointer text-sm font-medium">
      Inspect {fixture.type.replaceAll('-', ' ')} fixture
    </summary>
    <div class="pt-3">
      {#if documents[index] !== undefined}
        <RetainedAuditFixture value={documents[index]} />
      {:else}
        <p class="text-sm">{failure || 'Loading fixture…'}</p>
        {#if failure}
          <button type="button" class="text-sm underline" onclick={() => load(index)}>
            Retry fixture
          </button>
        {/if}
      {/if}
    </div>
  </details>
{/each}
