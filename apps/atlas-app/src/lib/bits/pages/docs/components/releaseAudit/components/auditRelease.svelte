<script lang="ts">
import type { AuditManifest } from '@repo/core/provenance'
import { m } from '#lib/bits/internal/i18n.js'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
import Bulk from './auditBulk.svelte'
import AlsCurations from './auditAlsCurations.svelte'
import { alsAuditDecisions } from './auditAlsDecisions'
import Translations from './auditTranslationSection.svelte'
import Applications from './auditApplications.svelte'
import Guards from './auditGuards.svelte'
import DivisionRules from './auditDivisionRules.svelte'
import ComparisonCard from './auditPatchCard.svelte'
import { matchesAudit } from './auditSearch'
import { guardCopy } from './auditGuardCopy'
import Controls from './releaseAuditControls.svelte'
import SectionHeading from './auditSectionHeading.svelte'
import { getAuditPage, getRetainedBulkFixture } from '#lib/registry/audit.remote.js'
import type { Json } from '@repo/core/provenance'
import {
  loadAuditFixtures,
  auditFixtureRows,
  matchesFixtureRow,
  fixtureHasContents,
  auditBulkTitle,
} from './auditFixtureRows'
let {
  manifest,
  hash,
  resourceType,
  releaseCode,
  showResourceHeading = true,
  showControls = true,
  query = $bindable(''),
  onSearchStateChange,
}: {
  manifest: AuditManifest
  hash: string
  resourceType: string
  releaseCode: string
  showResourceHeading?: boolean
  showControls?: boolean
  query?: string
  onSearchStateChange?: (state: {
    failed: boolean
    filteredCount: number
    loading: boolean
    totalCount: number
  }) => void
} = $props()
let effectiveQuery = $state('')
let matchingActions = $state(0)
let searchLoading = $state(false)
let searchFailure = $state('')
let fixtureGroups = $state.raw<Record<string, Record<string, Json>>>({})
let fixtureRows = $derived(
  Object.entries(fixtureGroups).flatMap(([id, groups]) =>
    id === 'curate-als-addresses'
      ? alsAuditDecisions(groups, releaseCode).map(d => ({
          title: d.title,
          description: d.description,
          context: d.context,
          decision: d.raw,
        }))
      : Object.values(groups).flatMap(auditFixtureRows),
  ),
)
let fixtureCountsLoading = $state(true)
let fixtureCountsFailed = $state(false)
let fixtureRetry = $state(0)
$effect(() => {
  fixtureRetry
  const releaseId = manifest.releaseId
  const currentHash = hash
  let current = true
  fixtureCountsLoading = true
  fixtureCountsFailed = false
  fixtureGroups = {}
  loadAuditFixtures(
    manifest.bulk,
    (bulkId, index) =>
      getRetainedBulkFixture({ releaseId, hash: currentHash, bulkId, index }),
    () => current,
  )
    .then(groups => {
      if (current) fixtureGroups = groups
    })
    .catch(() => {
      if (current) fixtureCountsFailed = true
    })
    .finally(() => {
      if (current) fixtureCountsLoading = false
    })
  return () => {
    current = false
  }
})
let matchingFixtureCount = $derived(
  fixtureRows.filter(row => matchesFixtureRow(effectiveQuery, row)).length,
)
$effect(() => {
  const value = query.trim().slice(0, 300)
  const timer = setTimeout(
    () => {
      effectiveQuery = value
    },
    value.length < 2 ? 0 : 200,
  )
  return () => clearTimeout(timer)
})
$effect(() => {
  if (!effectiveQuery) {
    matchingActions = 0
    searchLoading = false
    searchFailure = ''
    return
  }
  let current = true
  searchLoading = true
  searchFailure = ''
  getAuditPage({
    releaseId: manifest.releaseId,
    hash,
    q: effectiveQuery,
    offset: 0,
  })
    .then(result => {
      if (!current) return
      matchingActions = result.total
    })
    .catch(() => {
      if (current) searchFailure = m.source_audit_search_count_error()
    })
    .finally(() => {
      if (current) searchLoading = false
    })
  return () => {
    current = false
  }
})
const isPatch = (id: string) => /reclassified|restor|patch/.test(id)
let divisionRulesMatching = $state(false)
const matchesBulk = (item: AuditManifest['bulk'][number]) =>
  !effectiveQuery ||
  (item.id === 'normalise-divisions'
    ? divisionRulesMatching ||
      (!!hierarchyCount &&
        matchesAudit(effectiveQuery, m.source_audit_rules(), hierarchy, hierarchyCount))
    : matchesAudit(
        effectiveQuery,
        auditBulkTitle(item.id),
        item.id,
        item.summary,
        item.outcome,
        item.counts.inputs,
        item.counts.outputs,
      ) ||
      Object.values(fixtureGroups[item.id] ?? {}).some(value =>
        fixtureHasContents(value, effectiveQuery),
      ))
let countableBulk = $derived(
  manifest.bulk.filter(item => item.id !== 'curate-als-addresses'),
)
let matchingBulkCount = $derived(countableBulk.filter(matchesBulk).length)
let rules = $derived(
  manifest.bulk.filter(
    item =>
      item.basis === 'code' &&
      !isPatch(item.id) &&
      (item.id === 'normalise-divisions' || matchesBulk(item)),
  ),
)
let curations = $derived(
  manifest.bulk.filter(
    item =>
      item.basis === 'fixture' &&
      item.id !== 'curate-als-addresses' &&
      !isPatch(item.id) &&
      matchesBulk(item),
  ),
)
let patches = $derived(
  manifest.bulk.filter(item => isPatch(item.id) && matchesBulk(item)),
)
let hierarchyCount = $derived(
  manifest.bulk.find(item => item.id === 'normalise-divisions')?.counts.decisions
    .overture_division_hong_kong_area_hierarchy_assigned,
)
let hierarchy = $derived({
  title: m.source_audit_patch_area_hierarchy_title(),
  reason: m.source_audit_hierarchy_reason(),
  input: m.source_audit_hierarchy_input(),
  output: m.source_audit_hierarchy_output(),
})
let filteredGuards = $derived(
  manifest.guards.filter(
    guard =>
      guard.id !== 'address-materialisation' &&
      matchesAudit(effectiveQuery, m.source_audit_guards(), guard, guardCopy(guard)),
  ),
)
let filteredCount = $derived(
  fixtureCountsFailed || (effectiveQuery && searchFailure)
    ? 0
    : (effectiveQuery
        ? matchingActions + matchingBulkCount
        : manifest.applicationCount + countableBulk.length) + matchingFixtureCount,
)
let totalCount = $derived(
  fixtureCountsFailed
    ? 0
    : manifest.applicationCount + countableBulk.length + fixtureRows.length,
)
let searchLoadingState = $derived(
  fixtureCountsLoading ||
    (!!query.trim() &&
      (searchLoading || query.trim().slice(0, 300) !== effectiveQuery)),
)
$effect(() => {
  onSearchStateChange?.({
    failed: fixtureCountsFailed || Boolean(effectiveQuery && searchFailure),
    filteredCount,
    loading: searchLoadingState,
    totalCount,
  })
})
</script>

{#if showResourceHeading}
  <h2 class="mb-4 text-xl font-medium">{resourceLabel(resourceType)}</h2>
{/if}

<section
  class="space-y-1"
  data-audit-release={manifest.releaseId}
  aria-label={m.source_audit_title()}
>
  {#if showControls}
    <Controls
      bind:query
      filteredCount={fixtureCountsFailed || (effectiveQuery && searchFailure)
          ? '—'
          : filteredCount.toLocaleString()}
      totalCount={fixtureCountsFailed ? '—' : totalCount.toLocaleString()}
      loading={searchLoadingState}
      infoLabel={m.source_audit_search_info()}
      infoDescription={m.source_audit_search_info_description()}
      placeholder={m.source_audit_search_retained_placeholder()}
    />
  {/if}
  <Translations {manifest} {hash} query={effectiveQuery} />
  {#if fixtureCountsFailed}
    <p role="alert" class="text-sm">
      {m.source_audit_fixture_counts_error()}
      <button type="button" class="underline" onclick={() => fixtureRetry++}>
        {m.source_audit_retry_fixtures()}
      </button>
    </p>
  {/if}
  {#if searchFailure && effectiveQuery}
    <p role="alert" class="text-sm">{searchFailure}</p>
  {/if}
  <section
    class="hidden space-y-3 has-[article]:block has-[[role=alert]]:block has-[[role=status]]:block"
    aria-label={m.source_audit_patches()}
  >
    <SectionHeading
      title={m.source_audit_patches()}
      label={m.source_audit_patches_info()}
      description={m.source_audit_patches_info_description()}
    />
    {#each patches as bulk (bulk.id)}
      <Bulk
        query={effectiveQuery}
        {bulk}
        releaseId={manifest.releaseId}
        {hash}
        groups={fixtureGroups[bulk.id]}
      />
    {/each}
    <Applications
      releaseId={manifest.releaseId}
      {hash}
      category="patches"
      query={effectiveQuery}
    />
  </section>
  <section
    class="hidden space-y-4 has-[article]:block has-[[role=alert]]:block has-[[role=status]]:block"
    aria-label={m.source_audit_curations()}
  >
    <div
      class="hidden space-y-3 has-[article]:block has-[[role=alert]]:block has-[[role=status]]:block"
    >
      <h3
        class="flex items-center gap-3 px-2 text-lg font-medium"
        data-audit-toc-title={m.source_audit_custom_curations()}
      >
        {m.source_audit_curations()}
        <span class="text-sm font-normal opacity-60">{m.source_audit_custom()}</span>
      </h3>
      <Applications
        releaseId={manifest.releaseId}
        {hash}
        category="curations"
        query={effectiveQuery}
      />
      <AlsCurations
        groups={fixtureGroups['curate-als-addresses'] ?? {}}
        releaseId={releaseCode}
        query={effectiveQuery}
      />
    </div>
    {#if curations.length}
      <div class="space-y-3">
        <h3
          class="flex items-center gap-3 px-2 text-lg font-medium"
          data-audit-toc-title={m.source_audit_bulk_curations()}
        >
          {m.source_audit_curations()}
          <span class="text-sm font-normal opacity-60">{m.source_audit_bulk()}</span>
        </h3>
        {#each curations as bulk (bulk.id)}
          <Bulk
            query={effectiveQuery}
            {bulk}
            releaseId={manifest.releaseId}
            {hash}
            groups={fixtureGroups[bulk.id]}
          />
        {/each}
      </div>
    {/if}
  </section>
  <section
    class="hidden space-y-3 has-[article]:block has-[[role=alert]]:block has-[[role=status]]:block"
    aria-label={m.source_audit_rules()}
  >
    <SectionHeading
      title={m.source_audit_rules()}
      label={m.source_audit_rules_info()}
      description={m.source_audit_rules_info_description()}
    />
    <div class="space-y-5">
      {#if hierarchyCount !== undefined && hierarchyCount > 0 && matchesAudit(effectiveQuery, m.source_audit_rules(), hierarchy, hierarchyCount)}
        <ComparisonCard
          {...hierarchy}
          status="applied"
          statusLabel={m.source_audit_assigned_count({ count: hierarchyCount.toLocaleString() })}
        />
      {/if}
      {#each rules as bulk (bulk.id)}
        {#if bulk.id === 'normalise-divisions'}
          <DivisionRules
            {bulk}
            releaseId={manifest.releaseId}
            {hash}
            query={effectiveQuery}
            bind:matching={divisionRulesMatching}
          />
        {:else}
          <Bulk
            query={effectiveQuery}
            {bulk}
            releaseId={manifest.releaseId}
            {hash}
            groups={fixtureGroups[bulk.id]}
          />
        {/if}
      {/each}
      <Applications
        releaseId={manifest.releaseId}
        {hash}
        category="rules"
        query={effectiveQuery}
      />
    </div>
  </section>
  {#if filteredGuards.length}
    <Guards guards={filteredGuards} />
  {:else if manifest.bulk.some(b => b.id === 'prepare-als-addresses') && !effectiveQuery}
    <p class="px-2 py-3 text-sm opacity-60">
      Detailed source-guard results were not retained for this release.
    </p>
  {/if}
</section>
