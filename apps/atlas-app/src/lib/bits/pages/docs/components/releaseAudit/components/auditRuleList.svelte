<script lang="ts">
import type { BulkAudit, Json } from '@repo/core/provenance'
import { m } from '#lib/bits/internal/i18n.js'
import { getRetainedRuleDeclaration } from '#lib/registry/audit.remote.js'
import { retainedBranchGroups } from './auditBranchRows'
import { auditObject } from './auditDivisionPresentation'
import { auditDisplayedBulkTitle } from './auditFixtureRows'
import { auditBulkEvidence } from './auditBulkEvidence'
import type { FixtureCatalogue } from './auditFixtureCatalogue'
import { matchesAudit } from './auditSearch'
import Mappings from './auditRuleMappings.svelte'
import NameAliasRules from './auditNameAliasRules.svelte'
import PreparationOutcomes from './auditPreparationOutcomes.svelte'
import ComparisonCard from './auditPatchCard.svelte'
import Bulk from './auditBulk.svelte'
let {
  rules,
  allBulk,
  resourceReleaseId,
  hash,
  resourceType,
  preparationValue,
  filteredPreparation,
  hierarchy,
  hierarchyCount,
  catalogue,
  query = '',
  matching = $bindable(false),
}: {
  rules: BulkAudit[]
  allBulk: BulkAudit[]
  resourceReleaseId: string
  hash: string
  resourceType: string
  preparationValue?: Json
  filteredPreparation?: Json
  hierarchy: { title: string; reason: string; input: string; output: string }
  hierarchyCount?: number
  catalogue: FixtureCatalogue
  query?: string
  matching?: boolean
} = $props()
let declarations = $state<Record<string, Json>>({})
let failure = $state('')
let loading = $state(false)
let retry = $state(0)
const isMapping = (id: string) =>
  [
    'normalise-divisions',
    'normalise-planning-divisions',
    'prepare-curated-division-rules',
  ].includes(id)
// Load from the unfiltered manifest so searching cannot change the loader's scope.
let mappingIds = $derived(
  allBulk
    .filter(bulk => isMapping(bulk.id) && resourceType === 'division')
    .map(bulk => bulk.id)
    .join(','),
)
$effect(() => {
  const ids = mappingIds.split(',').filter(Boolean)
  const release = resourceReleaseId
  const digest = hash
  retry
  let active = true
  declarations = {}
  failure = ''
  loading = ids.length > 0
  Promise.all(
    ids.map(
      async id =>
        [
          id,
          await getRetainedRuleDeclaration({
            resourceReleaseId: release,
            hash: digest,
            bulkId: id,
          }),
        ] as const,
    ),
  )
    .then(values => {
      if (active) declarations = Object.fromEntries(values)
    })
    .catch(() => {
      if (active) failure = m.source_audit_load_rules_error()
    })
    .finally(() => {
      if (active) loading = false
    })
  return () => {
    active = false
  }
})
let mappingGroups = $derived(
  Object.entries(declarations).flatMap(([id, declaration]) => {
    const bulk = allBulk.find(item => item.id === id)!
    const retained = retainedBranchGroups(declaration, bulk.counts.branches)
    const locales = retained.filter(group => group.locale)
    return retained.flatMap(group => {
      if (!group.locale) return [{ ...group, bulk }]
      if (group !== locales[0]) return []
      return [
        {
          title: m.reference_locale_normalisation(),
          explanation:
            id === 'prepare-curated-division-rules'
              ? group.explanation
              : m.source_audit_locales_explanation(),
          locale: undefined,
          rows: locales.flatMap(item =>
            item.rows.map(row => ({ ...row, locale: item.locale })),
          ),
          bulk,
        },
      ]
    })
  }),
)
$effect(() => {
  matching =
    !query ||
    mappingGroups.some(group =>
      matchesAudit(query, m.source_audit_rules(), group.title, group.rows),
    )
})
type Item = { title: string; key: string } & (
  | { kind: 'mapping'; group: (typeof mappingGroups)[number] }
  | { kind: 'aliases'; entries: Json[] }
  | {
      kind: 'outcome'
      outcome: 'excluded' | 'restored'
      decisions?: Record<string, number>
    }
  | { kind: 'hierarchy' }
  | { kind: 'bulk'; bulk: BulkAudit }
)
let items = $derived.by(() => {
  const result: Item[] = []
  const entries = auditObject(filteredPreparation).entries
  const aliases = (Array.isArray(entries) ? entries : []).filter(
    entry =>
      auditObject(entry).section === 'names' &&
      auditObject(entry).collection === 'nameAliasRules',
  )
  if (aliases.length)
    result.push({
      kind: 'aliases',
      key: 'aliases',
      title: 'Name alias rules',
      entries: aliases,
    })
  const policy = rules.find(rule => rule.id === 'prepare-division-update-policy')
  if (
    resourceType === 'division' &&
    preparationValue &&
    (policy ||
      (!allBulk.some(rule => rule.id === 'prepare-division-update-policy') &&
        Object.keys(auditObject(auditObject(preparationValue).outcomes)).length))
  ) {
    result.push({
      kind: 'outcome',
      key: 'excluded',
      title: 'Exclusions',
      outcome: 'excluded',
      decisions: policy?.counts.decisions,
    })
    result.push({
      kind: 'outcome',
      key: 'restored',
      title: 'Missing names',
      outcome: 'restored',
      decisions: policy?.counts.decisions,
    })
  }
  if (
    resourceType === 'division' &&
    hierarchyCount &&
    matchesAudit(query, m.source_audit_rules(), hierarchy, hierarchyCount)
  )
    result.push({ kind: 'hierarchy', key: 'hierarchy', title: hierarchy.title })
  for (const group of mappingGroups)
    result.push({
      kind: 'mapping',
      key: `${group.bulk.id}:${group.title}`,
      title: group.title,
      group,
    })
  for (const bulk of rules)
    if (!isMapping(bulk.id) && bulk.id !== 'prepare-division-update-policy')
      result.push({
        kind: 'bulk',
        key: bulk.id,
        title: auditDisplayedBulkTitle(bulk.id),
        bulk,
      })
  return result.sort((a, b) => a.title.localeCompare(b.title))
})
</script>
{#each items as item (item.key)}
  {#if item.kind === 'aliases'}
    <NameAliasRules entries={item.entries} {query} />
  {:else if item.kind === 'outcome' && preparationValue}
    <PreparationOutcomes
      value={preparationValue}
      decisions={item.decisions}
      only={item.outcome}
      {query}
    />
  {:else if item.kind === 'hierarchy'}
    <ComparisonCard
      {...hierarchy}
      status="applied"
      statusLabel={m.source_audit_assigned_count({
        count: hierarchyCount!.toLocaleString(),
      })}
    />
  {:else if item.kind === 'mapping'}
    <Mappings
      {query}
      title={item.title}
      explanation={item.group.explanation}
      rows={item.group.rows}
      getRule={() =>
        getRetainedRuleDeclaration({
          resourceReleaseId,
          hash,
          bulkId: item.group.bulk.id,
        })}
    />
  {:else if item.kind === 'bulk'}
    <Bulk
      {query}
      bulk={item.bulk}
      {resourceReleaseId}
      {hash}
      evidence={auditBulkEvidence(item.bulk, allBulk)}
      groups={catalogue.groups[auditBulkEvidence(item.bulk, allBulk).id]}
    />
  {/if}
{/each}
{#if loading}
  <p role="status" class="text-sm opacity-60">
    {m.source_audit_loading_rule_mappings()}
  </p>
{/if}
{#if failure}
  <p role="alert" class="text-sm opacity-60">
    {failure}
    <button type="button" class="underline" onclick={() => retry++}>
      {m.source_audit_retry_rules()}
    </button>
  </p>
{/if}
