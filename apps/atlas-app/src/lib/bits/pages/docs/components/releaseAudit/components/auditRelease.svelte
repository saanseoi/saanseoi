<script lang="ts">
import type { AuditManifest, Json } from '@repo/core/provenance'
import { m } from '#lib/bits/internal/i18n.js'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
import Curations from './auditCurations.svelte'
import { curationMatchesResource } from './auditCurationSections'
import { auditObject } from './auditDivisionPresentation'
import { filterIndexedFixture } from './auditFixtureCatalogue'
import Bulk from './auditBulk.svelte'
import { auditBulkEvidence } from './auditBulkEvidence'
import AlsCurations from './auditAlsCurations.svelte'
import Translations from './auditTranslationSection.svelte'
import Applications from './auditApplications.svelte'
import Guards from './auditGuards.svelte'
import PreparationOutcomes from './auditPreparationOutcomes.svelte'
import RuleList from './auditRuleList.svelte'
import { matchesAudit, matchesAuditText } from './auditSearch'
import { guardCopy } from './auditGuardCopy'
import Controls from './releaseAuditControls.svelte'
import SectionHeading from './auditSectionHeading.svelte'
import {
  getAuditPage,
  getAuditFixtureCatalogue,
  getAuditFixtureGroup,
} from '#lib/registry/audit.remote.js'
import { catalogueGroupMatches, type FixtureCatalogue } from './auditFixtureCatalogue'
import { auditBulkTitle } from './auditFixtureRows'
import { provideLoadedFixtures } from './auditLoadedFixtures'
const loadedFixtureCache = provideLoadedFixtures()
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
let preparation = $derived(
  manifest.bulk.find(item => item.id === 'prepare-curated-division-edition'),
)
let preparationValue = $state.raw<Json>()
let preparationFailure = $state(false)
let preparationRetry = $state(0)
$effect(() => {
  preparationRetry
  if (!preparation) return
  const resourceReleaseId = manifest.resourceReleaseId
  const currentHash = hash
  let current = true
  preparationValue = undefined
  preparationFailure = false
  getAuditFixtureGroup({
    resourceReleaseId,
    hash: currentHash,
    bulkId: preparation.id,
    type: 'curation-definitions',
    releaseCode,
    q: '',
  })
    .then(value => {
      if (current) preparationValue = value
    })
    .catch(() => {
      if (current) preparationFailure = true
    })
  return () => {
    current = false
  }
})
let filteredPreparation = $derived.by(() => {
  const group = catalogue.groups[preparation?.id ?? '']?.['curation-definitions']
  if (!preparationValue || !group) return undefined
  const filtered = auditObject(
    filterIndexedFixture(preparationValue, group, effectiveQuery),
  )
  return {
    ...filtered,
    entries: Array.isArray(filtered.entries)
      ? filtered.entries.filter(entry => curationMatchesResource(entry, resourceType))
      : [],
  }
})

$effect(() => {
  hash
  loadedFixtureCache.clear()
})
let matchingActions = $state(0)
let searchLoading = $state(false)
let searchFailure = $state('')
let catalogue = $state.raw<FixtureCatalogue>({ groups: {}, als: [] })
let matchingBulkIds = $state<string[]>([])
let fixtureRows = $derived(
  Object.entries(catalogue.groups).flatMap(([id, groups]) =>
    id === 'curate-als-addresses'
      ? catalogue.als.map(d => d.text)
      : Object.entries(groups).flatMap(([type, group]) => {
          if (
            preparation &&
            resourceType !== 'division' &&
            ([
              'prepare-curated-division-rules',
              'prepare-division-update-policy',
              'normalise-divisions',
            ].includes(id) ||
              (id === preparation.id && type !== 'curation-definitions'))
          )
            return []
          if (id !== preparation?.id || type !== 'curation-definitions')
            return group.rows
          const entries = auditObject(preparationValue).entries
          return Array.isArray(entries)
            ? group.rows.filter((_, index) =>
                curationMatchesResource(entries[index] ?? null, resourceType),
              )
            : group.rows
        }),
  ),
)
let fixtureCountsLoading = $state(true)
let fixtureCountsFailed = $state(false)
let fixtureRetry = $state(0)
$effect(() => {
  fixtureRetry
  const resourceReleaseId = manifest.resourceReleaseId
  const currentHash = hash
  let current = true
  fixtureCountsLoading = true
  fixtureCountsFailed = false
  catalogue = { groups: {}, als: [] }
  getAuditFixtureCatalogue({ resourceReleaseId, hash: currentHash, releaseCode })
    .then(result => {
      if (current) catalogue = result
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
  fixtureRows.filter(text => matchesAuditText(effectiveQuery, text)).length,
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
    matchingBulkIds = []
    searchLoading = false
    searchFailure = ''
    return
  }
  let current = true
  searchLoading = true
  searchFailure = ''
  getAuditPage({
    resourceReleaseId: manifest.resourceReleaseId,
    hash,
    q: effectiveQuery,
    countOnly: true,
    offset: 0,
  })
    .then(result => {
      if (!current) return
      matchingActions = result.total
      matchingBulkIds = result.bulkIds
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
// Restoring one known missing country is a targeted patch, even when its audit
// includes dataset-wide before/after counts.
const isPatch = (id: string) =>
  id === 'retain-country-reference' || /reclassified|restor|patch/.test(id)
let divisionRulesMatching = $state(false)
const matchesBulk = (item: AuditManifest['bulk'][number]) =>
  !effectiveQuery ||
  (item.id === 'prepare-division-update-policy' &&
    matchesAudit(
      effectiveQuery,
      'Automatic division updates',
      auditObject(preparationValue).outcomeRecords,
    )) ||
  (['normalise-divisions', 'prepare-curated-division-rules'].includes(item.id)
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
      matchingBulkIds.includes(item.id) ||
      Object.values(
        catalogue.groups[auditBulkEvidence(item, manifest.bulk).id] ?? {},
      ).some(value => catalogueGroupMatches(value, effectiveQuery)))
let visibleBulk = $derived(
  manifest.bulk.filter(
    item =>
      item.id !== 'revalidate-overture-retained-source' &&
      !(
        preparation &&
        resourceType !== 'division' &&
        [
          'prepare-curated-division-rules',
          'prepare-division-update-policy',
          'normalise-divisions',
        ].includes(item.id)
      ) &&
      !(
        [
          'exclude-division-geometry',
          'exclude-overture-guangdong-source-geometry',
        ].includes(item.id) &&
        item.outcome === 'not-applicable' &&
        item.counts.decisions.excluded === 0
      ),
  ),
)
let countableBulk = $derived(
  visibleBulk.filter(
    item =>
      item.id !== 'curate-als-addresses' &&
      !(resourceType !== 'division' && item.id === preparation?.id),
  ),
)
let matchingBulkCount = $derived(countableBulk.filter(matchesBulk).length)
let rules = $derived(
  visibleBulk.filter(
    item =>
      item.basis === 'code' &&
      !isPatch(item.id) &&
      (['normalise-divisions', 'prepare-curated-division-rules'].includes(item.id) ||
        matchesBulk(item)),
  ),
)
let curations = $derived(
  visibleBulk.filter(
    item =>
      item.basis === 'fixture' &&
      item.id !== 'curate-als-addresses' &&
      item.id !== 'prepare-curated-division-edition' &&
      !isPatch(item.id) &&
      matchesBulk(item),
  ),
)
let patches = $derived(
  visibleBulk.filter(item => isPatch(item.id) && matchesBulk(item)),
)
let hierarchyCount = $derived(
  manifest.bulk.find(item =>
    ['normalise-divisions', 'prepare-curated-division-rules'].includes(item.id),
  )?.counts.decisions.overture_division_hong_kong_area_hierarchy_assigned,
)
let hierarchy = $derived({
  title: m.source_audit_patch_area_hierarchy_title(),
  reason: m.source_audit_hierarchy_reason(),
  input: m.source_audit_hierarchy_input(),
  output: m.source_audit_hierarchy_output(),
})
let visibleGuards = $derived(
  manifest.guards.filter(
    guard =>
      ![
        'address-materialisation',
        'historical-country-reference-evidence',
        'source-api-field-compatibility',
      ].includes(guard.id) &&
      (!preparation ||
        ([
          'curated-polygon-validity',
          'curated-core-point-containment',
          'rejected-island-boundaries',
        ].includes(guard.id)
          ? resourceType === 'divisionArea'
          : resourceType === 'division')),
  ),
)
let filteredGuards = $derived(
  visibleGuards.filter(guard =>
    matchesAudit(effectiveQuery, m.source_audit_guards(), guard, guardCopy(guard)),
  ),
)
let filteredCount = $derived(
  fixtureCountsFailed || (effectiveQuery && searchFailure)
    ? 0
    : (effectiveQuery
        ? matchingActions + matchingBulkCount
        : manifest.applicationCount + countableBulk.length) +
        matchingFixtureCount +
        filteredGuards.length,
)
let totalCount = $derived(
  fixtureCountsFailed
    ? 0
    : manifest.applicationCount +
        countableBulk.length +
        fixtureRows.length +
        visibleGuards.length,
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
  class="flex flex-col gap-4"
  data-audit-release={hash}
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
  {#if preparationFailure}
    <p role="alert">
      Unable to load curations.
      <button type="button" class="underline" onclick={() => preparationRetry++}>
        Retry
      </button>
    </p>
  {:else if preparation && preparationValue === undefined}
    <p role="status" class="text-sm opacity-50">Loading curations…</p>
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
    {#if filteredPreparation}
      <Curations
        value={filteredPreparation}
        query={effectiveQuery}
        category="patches"
      />
    {/if}
    {#each patches as bulk (bulk.id)}
      <Bulk
        query={effectiveQuery}
        {bulk}
        resourceReleaseId={manifest.resourceReleaseId}
        {hash}
        evidence={auditBulkEvidence(bulk, manifest.bulk)}
        groups={catalogue.groups[auditBulkEvidence(bulk, manifest.bulk).id]}
      />
    {/each}
    <Applications
      resourceReleaseId={manifest.resourceReleaseId}
      {hash}
      category="patches"
      query={effectiveQuery}
    />
  </section>
  <section
    class="hidden space-y-4 has-[article]:block has-[[role=alert]]:block has-[[role=status]]:block"
    aria-label={m.source_audit_curations()}
  >
    <h3
      class="text-xs font-medium uppercase tracking-widest text-foreground-alt"
      data-audit-toc-title={m.source_audit_curations()}
    >
      {m.source_audit_curations()}
    </h3>
    <Applications
      resourceReleaseId={manifest.resourceReleaseId}
      {hash}
      category="curations"
      query={effectiveQuery}
    />
    {#if filteredPreparation}
      <Curations
        value={filteredPreparation}
        query={effectiveQuery}
        category="curations"
      />
    {/if}
    <AlsCurations
      rows={catalogue.als}
      resourceReleaseId={manifest.resourceReleaseId}
      {releaseCode}
      {hash}
      query={effectiveQuery}
    />
    {#each curations as bulk (bulk.id)}
      <Bulk
        query={effectiveQuery}
        {bulk}
        resourceReleaseId={manifest.resourceReleaseId}
        {hash}
        evidence={auditBulkEvidence(bulk, manifest.bulk)}
        groups={catalogue.groups[auditBulkEvidence(bulk, manifest.bulk).id]}
        presentationTitle={bulk.id === 'prepare-division-update-policy'
          ? 'Automatic division updates'
          : undefined}
      >
        {#snippet footer()}
          {#if bulk.id === 'prepare-division-update-policy' && preparationValue}
            <PreparationOutcomes
              value={preparationValue}
              decisions={bulk.counts.decisions}
              query={effectiveQuery}
            />
          {/if}
        {/snippet}
      </Bulk>
    {/each}
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
      <RuleList
        {rules}
        allBulk={manifest.bulk}
        resourceReleaseId={manifest.resourceReleaseId}
        {hash}
        {resourceType}
        {preparationValue}
        {filteredPreparation}
        {hierarchy}
        {hierarchyCount}
        {catalogue}
        query={effectiveQuery}
        bind:matching={divisionRulesMatching}
      />
      <Applications
        resourceReleaseId={manifest.resourceReleaseId}
        {hash}
        category="rules"
        query={effectiveQuery}
      />
    </div>
  </section>
  {#if filteredGuards.length}
    <Guards
      guards={filteredGuards}
      coverageNote={preparation
        ? 'Checks required to prepare the divisions and their boundaries.'
        : undefined}
    />
  {:else if manifest.bulk.some(b => b.id === 'prepare-als-addresses') &&
    !effectiveQuery}
    <p class="px-2 py-3 text-sm opacity-60">
      Detailed source-guard results were not saved for this release.
    </p>
  {/if}
</section>
