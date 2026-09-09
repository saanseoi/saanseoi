<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { BulkAudit, Json } from '@repo/core/provenance'
import { getRetainedRuleDeclaration } from '#lib/registry/audit.remote.js'
import Mappings from './auditRuleMappings.svelte'
import { retainedBranchGroups } from './auditBranchRows'
import { matchesAudit } from './auditSearch'
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
let groups = $derived.by(() => {
  const retained = retainedBranchGroups(declaration, bulk.counts.branches)
  const locales = retained.filter(group => group.locale)
  return retained.flatMap(group => {
    if (!group.locale) return [group]
    if (group !== locales[0]) return []
    return [
      {
        title: m.reference_locale_normalisation(),
        explanation: m.source_audit_locales_explanation(),
        locale: undefined,
        rows: locales.flatMap(item =>
          item.rows.map(row => ({ ...row, locale: item.locale })),
        ),
      },
    ]
  })
})
$effect(() => {
  matching =
    !query ||
    groups.some(group =>
      matchesAudit(query, m.source_audit_rules(), group.title, group.rows),
    )
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
{:else}
  <p class="text-sm opacity-60">{failure || m.source_audit_loading_rule_mappings()}</p>
  {#if failure}
    <button type="button" class="text-sm underline" onclick={load}>
      {m.source_audit_retry_rules()}
    </button>
  {/if}
{/if}
