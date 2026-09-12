<script lang="ts">
import type { IndividualAudit } from '@repo/core/provenance'
import { auditActionSearchText } from '@repo/core/provenance/auditPageIndex'
import { untrack } from 'svelte'
import { matchesAuditText } from './auditSearch'
import { m } from '#lib/bits/internal/i18n.js'
import { getAuditPage } from '#lib/registry/audit.remote.js'
import ApplicationCard from './auditApplicationCard.svelte'
import PatchCard from './auditPatchCard.svelte'
import { auditApplicationComparison } from './auditApplicationComparison'
import ApplicationSkeleton from './auditApplicationSkeleton.svelte'
let {
  releaseId,
  hash,
  category,
  fixtureIndex,
  entryIndex,
  query = '',
  onLoading,
  onResult,
}: {
  releaseId: string
  hash: string
  category?: 'translations' | 'patches' | 'curations' | 'rules'
  fixtureIndex?: number
  entryIndex?: number
  query?: string
  onLoading?: (loading: boolean) => void
  onResult?: (result: { total: number; bulkIds: string[] }) => void
} = $props()
let rows = $state<IndividualAudit[]>([])
let nextOffset = $state<number | null>(0)
let loading = $state(false)
let failure = $state('')
let generation = 0
let scope = ''
let complete: Array<{ row: IndividualAudit; text: string }> | undefined
let resolved = $state(false)
async function load(reset = false) {
  const request = ++generation
  const currentScope = JSON.stringify([
    releaseId,
    hash,
    category,
    fixtureIndex,
    entryIndex,
  ])
  if (currentScope !== scope) {
    scope = currentScope
    complete = undefined
    rows = []
    resolved = false
  }
  const offset = reset ? 0 : (nextOffset ?? 0)
  const currentQuery = query
  if (complete) {
    const matching = complete.filter(entry =>
      matchesAuditText(currentQuery, entry.text),
    )
    rows = matching.slice(0, offset + 50).map(entry => entry.row)
    nextOffset = rows.length < matching.length ? rows.length : null
    loading = false
    failure = ''
    onLoading?.(false)
    onResult?.({ total: matching.length, bulkIds: [] })
    return
  }
  loading = true
  onLoading?.(true)
  try {
    const page = await getAuditPage({
      releaseId,
      hash,
      category,
      fixtureIndex,
      entryIndex,
      q: currentQuery,
      offset,
    })
    if (request !== generation) return
    rows = reset ? page.rows : [...rows, ...page.rows]
    nextOffset = page.nextOffset
    failure = ''
    resolved = true
    if (!currentQuery && page.nextOffset === null)
      complete = rows.map(row => ({ row, text: auditActionSearchText(row) }))
    onResult?.({ total: page.total, bulkIds: page.bulkIds })
  } catch {
    if (request === generation) failure = m.source_audit_load_actions_error()
  } finally {
    if (request === generation) {
      loading = false
      onLoading?.(false)
    }
  }
}
$effect(() => {
  query
  releaseId
  hash
  category
  fixtureIndex
  entryIndex
  untrack(() => {
    void load(true)
  })
  return () => {
    generation++
  }
})
</script>

<div class="space-y-5" aria-busy={loading}>
  {#each rows as row (row.id)}
    {@const comparison = auditApplicationComparison(row)}
    {@const areaGeometry = row.operation === 'overture_hong_kong_area_geometry_restored'}
    {@const areaName = row.record.names[0] || row.record.id}
    {@const areaIdentity = row.operation === 'overture_hong_kong_area_identities_restored'}
    {#if category === 'patches' || comparison}
      <PatchCard
        geometryReleaseId={areaGeometry ? releaseId : undefined}
        exclusion={areaGeometry && areaName === 'New Territories' ? row.context.geometryRule : null}
        title={row.operation === 'overture_hong_kong_lok_ma_chau_loop_reclassified' ? m.source_audit_patch_lok_ma_chau_title() : row.operation === 'overture_hong_kong_kowloon_restored' ? m.source_audit_patch_kowloon_title() : row.record.names[0] || row.record.id}
        reason={areaIdentity ? `Restore ${areaName} when it is missing from Overture.` : areaGeometry ? `Restore the missing ${areaName} area geometry from its district land geometries${areaName === 'New Territories' ? ', including Lok Ma Chau Loop, and excluding Shenzhen Bay Port' : ''}.` : row.outcome === 'applied' && row.operation === 'overture_hong_kong_lok_ma_chau_loop_reclassified' ? m.source_audit_patch_lok_ma_chau_reason() : row.outcome === 'applied' && row.operation === 'overture_hong_kong_kowloon_restored' ? m.source_audit_patch_kowloon_reason() : row.reason}
        id={row.record.id}
        status={row.outcome}
        input={comparison?.input ?? null}
        output={comparison?.output ?? null}
      />
    {:else}
      <ApplicationCard {row} />
    {/if}
  {/each}
  {#if failure}
    <p role="alert" class="text-sm">{failure}</p>
    <button type="button" class="text-sm underline" onclick={() => load(true)}>
      {m.source_audit_retry_actions()}
    </button>
  {/if}
  {#if loading && !resolved}
    {#key query}
      <ApplicationSkeleton />
    {/key}
  {:else if !loading && nextOffset !== null && rows.length}
    <button
      type="button"
      class="rounded-lg border border-current/20 px-3 py-2 text-sm"
      onclick={() => load()}
    >
      {m.source_audit_more_actions()}
    </button>
  {/if}
</div>
