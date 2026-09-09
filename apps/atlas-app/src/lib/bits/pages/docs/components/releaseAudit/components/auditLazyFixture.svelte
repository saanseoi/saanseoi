<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { untrack } from 'svelte'
import { m } from '#lib/bits/internal/i18n.js'
import { getAuditFixtureGroup } from '#lib/registry/audit.remote.js'
import type { FixtureSearchGroup } from './auditFixtureCatalogue'
import { matchesAuditText } from './auditSearch'
import FixtureDisclosure from './auditFixtureDisclosure.svelte'
import AuditFixture from './auditFixture.svelte'
import Skeleton from './auditApplicationSkeleton.svelte'

let {
  releaseId,
  hash,
  bulkId,
  type,
  query,
  label,
  group,
}: {
  releaseId: string
  hash: string
  bulkId: string
  type: string
  query: string
  label: string
  group: FixtureSearchGroup
} = $props()
let open = $state(
  untrack(() => type === 'statistic-fields' || type === 'statistic-measures'),
)
let value = $state<Json>()
let failure = $state(false)
let retry = $state(0)
let count = $derived(group.rows.filter(text => matchesAuditText(query, text)).length)
$effect(() => {
  if (!open) return
  retry
  let current = true
  value = undefined
  failure = false
  getAuditFixtureGroup({ releaseId, hash, bulkId, type, q: query })
    .then(result => {
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

<FixtureDisclosure bind:open>
  {#snippet summary()}
    {label}
    <span class="ml-2 text-xs font-normal tabular-nums opacity-50"
      >{count}
      / {group.rows.length}</span
    >
  {/snippet}
  {#if value !== undefined}
    <AuditFixture {value} />
  {:else if failure}
    <p role="alert">{m.source_audit_load_actions_error()}</p>
    <button type="button" class="text-sm underline" onclick={() => retry++}>
      {m.source_audit_retry_fixture()}
    </button>
  {:else}
    <Skeleton />
  {/if}
</FixtureDisclosure>
