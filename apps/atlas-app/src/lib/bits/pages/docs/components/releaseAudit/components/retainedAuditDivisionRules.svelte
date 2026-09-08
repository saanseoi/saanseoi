<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { BulkAudit, Json } from '@repo/core/provenance'
import { getRetainedRuleDeclaration } from '#lib/registry/audit.remote.js'
import Mappings from './retainedAuditRuleMappings.svelte'
import Parameters from './retainedAuditRuleParameters.svelte'
import { retainedBranchGroups } from './retainedAuditBranchRows'
import { matchesAudit } from './retainedAuditSearch'
let {
  bulk,
  releaseId,
  hash,
  query = '',
  matching = $bindable(false),
}: {
  bulk: BulkAudit
  releaseId: string
  hash: string
  query?: string
  matching?: boolean
} = $props()
let declaration = $state<Json>()
let failure = $state('')
let groups = $derived(retainedBranchGroups(declaration, bulk.counts.branches))
let parameters = $derived(
  declaration && typeof declaration === 'object' && !Array.isArray(declaration)
    ? declaration.parameters
    : undefined,
)
$effect(() => {
  matching =
    !query ||
    groups.some(group =>
      matchesAudit(query, m.source_audit_rules(), group.title, group.rows),
    ) ||
    matchesAudit(query, parameters)
})
let request = 0
async function load() {
  const current = ++request
  declaration = undefined
  failure = ''
  try {
    const value = await getRetainedRuleDeclaration({ releaseId, hash, bulkId: bulk.id })
    if (current === request) declaration = value
  } catch {
    if (current === request) failure = m.source_audit_load_rules_error()
  }
}
$effect(() => {
  releaseId
  hash
  bulk.id
  void load()
})
</script>
{#if declaration}
  {#if groups.length}
    {#each groups as group}
      <Mappings
        {query}
        title={group.title}
        explanation={group.explanation}
        rows={group.rows}
        getRule={() => getRetainedRuleDeclaration({releaseId, hash, bulkId: bulk.id})}
      />
    {/each}
  {:else}
    <p class="text-sm opacity-65">{m.source_audit_branches_unrecorded()}</p>
  {/if}
  {#if parameters && typeof parameters === 'object' && !Array.isArray(parameters) && matchesAudit(query, parameters)}
    <details class="rounded-xl border border-current/15 p-4 text-sm">
      <summary class="cursor-pointer">
        {m.source_audit_parameters_counting_units()}
      </summary>
      <div class="pt-4"><Parameters {parameters} /></div>
    </details>
  {/if}
{:else}
  <p class="text-sm opacity-60">{failure || m.source_audit_loading_rule_mappings()}</p>
  {#if failure}
    <button type="button" class="text-sm underline" onclick={load}>
      {m.source_audit_retry_rules()}
    </button>
  {/if}
{/if}
