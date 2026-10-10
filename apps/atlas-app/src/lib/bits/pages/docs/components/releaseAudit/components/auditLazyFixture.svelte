<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { m } from '#lib/bits/internal/i18n.js'
import { getAuditFixtureGroup } from '#lib/registry/audit.remote.js'
import { filterIndexedFixture, type FixtureSearchGroup } from './auditFixtureCatalogue'
import { matchesAuditText } from './auditSearch'
import FixtureDisclosure from './auditFixtureDisclosure.svelte'
import AuditFixture from './auditFixture.svelte'
import Curations from './auditCurations.svelte'
import DivisionRecords from './auditDivisionRecords.svelte'
import { divisionFixtureDescriptions } from './auditDivisionPresentation'
import Skeleton from './auditApplicationSkeleton.svelte'
import { loadedFixtures } from './auditLoadedFixtures'
const retained = loadedFixtures()

let {
  resourceReleaseId,
  hash,
  bulkId,
  type,
  query,
  label,
  group,
}: {
  resourceReleaseId: string
  hash: string
  bulkId: string
  type: string
  query: string
  label: string
  group: FixtureSearchGroup
} = $props()
let open = $state(false)
// Searching reveals matching result lists without another disclosure click.
$effect(() => {
  open = Boolean(query.trim()) && count > 0
})
let value = $state<Json>()
let failure = $state(false)
let retry = $state(0)
let count = $derived(group.rows.filter(text => matchesAuditText(query, text)).length)
let filtered = $derived(
  value === undefined ? undefined : filterIndexedFixture(value, group, query),
)
$effect(() => {
  if (!open) return
  retry
  const key = JSON.stringify([resourceReleaseId, hash, bulkId, type])
  const cached = retained.get(key)
  if (cached !== undefined) {
    value = cached
    failure = false
    return
  }
  let current = true
  value = undefined
  failure = false
  getAuditFixtureGroup({ resourceReleaseId, hash, bulkId, type, q: '' })
    .then(result => {
      retained.set(key, result)
      if (current) value = result
    })
    .catch(() => {
      if (current) failure = true
    })
  return () => {
    current = false
  }
})
</script>

<FixtureDisclosure bind:open prominent={type === 'prepared-division-changes'}>
  {#snippet summary()}
    {type === 'prepared-division-changes' ? 'Results' : label}
    <span class="ml-2 text-xs font-normal tabular-nums opacity-50"
      >{count.toLocaleString()}
      / {group.rows.length.toLocaleString()}</span
    >
  {/snippet}
  {#if filtered !== undefined}
    {#if type === 'curation-definitions'}
      {#each ['curations', 'patches', 'rules'] as category}
        <Curations
          value={filtered}
          {query}
          category={category as 'curations' | 'patches' | 'rules'}
        />
      {/each}
    {:else if type in divisionFixtureDescriptions}
      <DivisionRecords value={filtered} {type} />
    {:else}
      <AuditFixture value={filtered} />
    {/if}
  {:else if failure}
    <p role="alert">{m.source_audit_load_actions_error()}</p>
    <button type="button" class="text-sm underline" onclick={() => retry++}>
      {m.source_audit_retry_fixture()}
    </button>
  {:else}
    <Skeleton />
  {/if}
</FixtureDisclosure>
