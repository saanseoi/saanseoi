<script lang="ts">
import type { BulkAudit, Json } from '@repo/core/provenance'
import {
  getRetainedBulkFixture,
  getRetainedRuleDeclaration,
} from '#lib/registry/audit.remote.js'
import RetainedAuditFixture from './retainedAuditFixture.svelte'
let { bulk, releaseId, hash }: { bulk: BulkAudit; releaseId: string; hash: string } =
  $props()
let fixtures = $state<Record<number, Json>>({})
let failure = $state('')
let declaration = $state<Json>()
async function loadDeclaration() {
  try {
    declaration = await getRetainedRuleDeclaration({ releaseId, hash, bulkId: bulk.id })
    failure = ''
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
}
async function load(index: number) {
  try {
    fixtures[index] = await getRetainedBulkFixture({
      releaseId,
      hash,
      bulkId: bulk.id,
      index,
    })
    failure = ''
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
}
</script>

<article class="space-y-3 rounded-xl border border-current/15 p-4">
  <div
    class="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide opacity-60"
  >
    <span>Bulk {bulk.basis === 'fixture' ? 'curation' : 'rule'}</span
    ><span>{bulk.outcome}</span>
  </div>
  <h3 class="font-medium">{bulk.summary}</h3>
  <details
    class="text-sm"
    ontoggle={event => { if (event.currentTarget.open && declaration === undefined) void loadDeclaration() }}
  >
    <summary class="cursor-pointer opacity-65">Rule declaration</summary>
    <div class="pt-3">
      {#if declaration !== undefined}
        <RetainedAuditFixture value={declaration} />
      {:else}
        <p>{failure || 'Loading declaration…'}</p>
      {/if}
    </div>
  </details>
  <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
    <div>
      <dt class="opacity-60">Records affected</dt>
      <dd>{bulk.counts.recordsAffected.toLocaleString()}</dd>
    </div>
    {#each Object.entries(bulk.counts.inputs) as [name, count]}
      <div>
        <dt class="opacity-60">{name} examined</dt>
        <dd>{count.toLocaleString()}</dd>
      </div>
    {/each}
    {#each Object.entries(bulk.counts.outputs) as [name, count]}
      <div>
        <dt class="opacity-60">{name} produced</dt>
        <dd>{count.toLocaleString()}</dd>
      </div>
    {/each}
    {#each Object.entries(bulk.counts.decisions) as [name, count]}
      <div>
        <dt class="opacity-60">{name} decisions</dt>
        <dd>{count.toLocaleString()}</dd>
      </div>
    {/each}
  </dl>
  {#each bulk.fixtures as fixture, index}
    <details
      class="rounded-lg bg-current/5 p-3"
      ontoggle={event => { if (event.currentTarget.open && !fixtures[index]) void load(index) }}
    >
      <summary class="cursor-pointer text-sm font-medium">
        Inspect {fixture.type.replaceAll('-', ' ')}
      </summary>
      <div class="pt-4">
        {#if fixtures[index] !== undefined}
          <RetainedAuditFixture value={fixtures[index]} />
        {:else}
          <p class="text-sm">{failure || 'Loading fixture…'}</p>
        {/if}
      </div>
    </details>
  {/each}
</article>
