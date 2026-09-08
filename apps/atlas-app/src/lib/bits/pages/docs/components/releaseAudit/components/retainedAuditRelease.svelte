<script lang="ts">
import type { AuditManifest, IndividualAudit } from '@repo/core/provenance'
import { getRetainedAuditPage } from '#lib/registry/audit.remote.js'
import RetainedAuditBulk from './retainedAuditBulk.svelte'
import RetainedAuditFixture from './retainedAuditFixture.svelte'
let {
  manifest,
  hash,
  resourceType,
}: { manifest: AuditManifest; hash: string; resourceType: string } = $props()
let query = $state('')
let rows = $state<IndividualAudit[]>([])
let nextOffset = $state<number | null>(0)
let loading = $state(false)
let failure = $state('')
let requested = $state(false)
let generation = 0
async function load(reset = false) {
  const request = ++generation
  loading = true
  requested = true
  try {
    const page = await getRetainedAuditPage({
      releaseId: manifest.releaseId,
      hash,
      q: query,
      offset: reset ? 0 : (nextOffset ?? 0),
    })
    if (request !== generation) return
    rows = reset ? page.rows : [...rows, ...page.rows]
    nextOffset = page.nextOffset
    failure = ''
  } catch (e) {
    if (request === generation) failure = e instanceof Error ? e.message : String(e)
  } finally {
    if (request === generation) loading = false
  }
}
let bulk = $derived(
  manifest.bulk.filter(
    b => !query || `${b.id} ${b.summary}`.toLowerCase().includes(query.toLowerCase()),
  ),
)
</script>

<section class="space-y-4" aria-label={`${resourceType} processing audit`}>
  <div class="flex flex-wrap justify-between gap-2">
    <h2 class="text-lg font-medium capitalize">{resourceType} audit</h2>
    <span class="text-sm opacity-60">{manifest.attempt.status}</span>
  </div>
  <form class="flex gap-2" onsubmit={e => { e.preventDefault(); void load(true) }}>
    <input
      class="min-w-0 flex-1 rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm"
      aria-label="Search processing audit"
      placeholder="Search rules, record names, IDs or parent names"
      bind:value={query}
    >
    <button
      class="rounded-lg border border-current/20 px-3 py-2 text-sm"
      type="submit"
      disabled={loading}
    >
      Search
    </button>
  </form>
  {#each bulk as item (item.id)}
    <RetainedAuditBulk bulk={item} releaseId={manifest.releaseId} {hash} />
  {/each}
  {#if manifest.guards.length}
    <section class="space-y-2" aria-label="Guards">
      <h3 class="font-medium">Guards</h3>
      {#each manifest.guards as guard (guard.id)}
        <article class="rounded-lg border border-current/15 p-3 text-sm">
          <div class="flex justify-between gap-3">
            <span>{guard.summary}</span><strong>{guard.status}</strong>
          </div>
          <p class="mt-1 opacity-60">
            {guard.consequence === 'block-ingestion' ? 'Blocks ingestion on failure' : 'Reports failures'}
            · {guard.checked} checked · {guard.failed} failed
          </p>
          <p class="mt-1">{guard.reason}</p>
        </article>
      {/each}
    </section>
  {/if}
  <section class="space-y-3" aria-label="Individual actions">
    <h3 class="font-medium">
      Individual actions · {manifest.applicationCount.toLocaleString()}
    </h3>
    {#each rows as row (row.id)}
      <article class="space-y-2 rounded-xl border border-current/15 p-4 text-sm">
        <div class="flex justify-between gap-3 text-xs uppercase opacity-60">
          <span>Individual {row.basis === 'fixture' ? 'curation' : 'rule'}</span
          ><span>{row.outcome}</span>
        </div>
        <h4 class="font-medium">{row.record.names.join(' · ') || row.record.id}</h4>
        <p>{row.summary}</p>
        <p class="opacity-65">{row.reason}</p>
        {#each row.record.parents as parent}
          <p class="opacity-65">Parent: {parent.names.join(' · ') || parent.id}</p>
        {/each}
        <details>
          <summary class="cursor-pointer">Decision context</summary>
          <div class="pt-3"><RetainedAuditFixture value={row.context} /></div>
        </details>
      </article>
    {/each}
    {#if failure}
      <p role="alert">{failure}</p>
    {/if}
    {#if manifest.applicationCount && nextOffset !== null}
      <button
        type="button"
        class="rounded-lg border border-current/20 px-3 py-2 text-sm"
        disabled={loading}
        onclick={() => load()}
      >
        {loading ? 'Loading…' : requested ? 'Load more' : 'Load individual actions'}
      </button>
    {:else if requested && !rows.length}
      <p class="text-sm opacity-60">No matching individual actions.</p>
    {/if}
  </section>
</section>
