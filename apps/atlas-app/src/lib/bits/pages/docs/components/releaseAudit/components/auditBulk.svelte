<script lang="ts">
import type { Snippet } from 'svelte'
import { m } from '#lib/bits/internal/i18n.js'
import StatusBadge from './auditStatusBadge.svelte'
import CountryPatch from './auditCountryPatch.svelte'
import type { BulkAudit, Json } from '@repo/core/provenance'
import {
  getRetainedBulkFixture,
  getAuditFixtureGroup,
  getRetainedRuleDeclaration,
} from '#lib/registry/audit.remote.js'
import LazyFixture from './auditLazyFixture.svelte'
import Skeleton from './auditApplicationSkeleton.svelte'
import CopyRule from './auditCopyRule.svelte'
import RuleParameters from './auditRuleParameters.svelte'
import { catalogueGroupMatches, type FixtureSearchGroup } from './auditFixtureCatalogue'
import { auditRuleCopy } from './auditRuleCopy'
import { auditDisplayedBulkTitle } from './auditFixtureRows'
const labels = (): Record<string, string> => ({
  'curation-definitions': 'Curations',
  'prepared-division-changes': 'Preprocessing changes',
  'retained-records': m.source_audit_saved_records(),
  'verified-records': m.source_audit_checked_records(),
  'publisher-occurrences': m.source_audit_als_publisher_occurrences(),
  'als-curations': m.source_audit_als_curations(),
  'prepared-addresses': m.source_audit_als_prepared_addresses(),
  'curation-documents': m.source_audit_als_curation_documents(),
  address2d: m.source_audit_als_address2d(),
  address2dI18n: m.source_audit_als_address2d_i18n(),
  address3d: m.source_audit_als_address3d(),
  address3dUnits: m.source_audit_als_address3d_units(),
})
const label = (value: string) =>
  labels()[value] ??
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\bals\b/gi, 'ALS')
let {
  bulk,
  resourceReleaseId,
  hash,
  query = '',
  groups,
  evidence = bulk,
  fixtureTypes,
  presentationTitle,
  footer,
}: {
  footer?: Snippet
  fixtureTypes?: string[]
  presentationTitle?: string
  bulk: BulkAudit
  evidence?: BulkAudit
  resourceReleaseId: string
  hash: string
  query?: string
  groups?: Record<string, FixtureSearchGroup>
} = $props()
let noExclusions = $derived(
  ['exclude-division-geometry', 'exclude-overture-guangdong-source-geometry'].includes(
    bulk.id,
  ) &&
    bulk.outcome === 'not-applicable' &&
    bulk.counts.decisions.excluded === 0,
)
let failure = $state('')
let declaration = $state<Json>()
let parameters = $derived.by(() => {
  const value =
    declaration && typeof declaration === 'object' && !Array.isArray(declaration)
      ? declaration.parameters
      : null
  if (
    bulk.id === 'prepare-curated-division-edition' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== 'evidenceHash'),
    )
  return value
})
$effect(() => {
  resourceReleaseId
  hash
  bulk.id
  void loadDeclaration()
})
async function loadDeclaration() {
  try {
    declaration = await getRetainedRuleDeclaration({
      resourceReleaseId,
      hash,
      bulkId: bulk.id,
    })
    failure = ''
  } catch {
    failure = m.source_audit_load_rules_error()
  }
}
</script>

<article class="overflow-hidden rounded-xl border border-current/15 text-sm">
  <header
    class="flex min-h-14 items-center justify-between gap-4 bg-current/2.5 px-4 py-3"
  >
    <h4 class="text-base font-medium">
      {presentationTitle ?? auditDisplayedBulkTitle(bulk.id)}
    </h4>
    <div class="flex items-center gap-2">
      {#if bulk.id === 'normalise-als-addresses'}
        <span class="rounded-full border border-current/15 px-2 py-1 text-xs opacity-65"
          >{m.source_audit_als_depends_on({
            rule: m.source_audit_als_prepare_title(),
          })}</span
        >
      {/if}
      <StatusBadge status={noExclusions ? 'no-exclusions' : bulk.outcome} />
      <CopyRule
        getRule={() =>
          getRetainedRuleDeclaration({ resourceReleaseId, hash, bulkId: bulk.id })}
      />
    </div>
  </header>
  <p class="border-t border-current/10 px-4 py-3 leading-relaxed opacity-65">
    {bulk.id === 'prepare-als-addresses'
      ? m.source_audit_als_prepare_summary()
      : bulk.id === 'normalise-als-addresses'
        ? m.source_audit_als_normalise_summary()
        : (auditRuleCopy(bulk.id)?.summary ?? bulk.summary)}
  </p>
  {#if noExclusions}
    <p class="border-t border-current/10 px-4 py-3 text-sm opacity-65">
      {m.source_audit_no_exclusions_reason()}
    </p>
  {/if}
  {#if bulk.id === 'retain-country-reference'}
    <CountryPatch {bulk} {resourceReleaseId} {hash} />
  {:else if !(bulk.id === 'prepare-curated-division-edition' && query.trim())}
    <div class="grid grid-cols-2 border-t border-current/10">
      {#each [
        { title: m.source_audit_input(), counts: bulk.counts.inputs, side: 'input' },
        { title: m.source_audit_output(), counts: bulk.counts.outputs, side: 'output' },
      ] as side}
        <div class="space-y-2 px-4 py-3 first:border-r first:border-current/10">
          <p class="text-xs uppercase opacity-45">{side.title}</p>
          {#each Object.entries(side.counts) as [name, count]}
            <div class="flex flex-wrap justify-between gap-2">
              <span class="capitalize opacity-65"
                >{bulk.id === 'prepare-curated-division-edition'
                  ? ((side.side === 'input'
                      ? (
                          {
                            areas: 'SaanSeoi Divisions',
                            islands: 'Protomap Islands',
                            landsd: 'LandsD Places',
                            overture: 'Overture Divisions',
                          } as Record<string, string>
                        )[name]
                      : (
                          {
                            areas: 'Division Areas',
                            divisions: 'Divisions',
                            names: 'Names I18n',
                          } as Record<string, string>
                        )[name]) ?? label(name))
                  : label(name)}</span
              ><code class="rounded bg-emerald-500/10 px-1.5 text-emerald-500"
                >{count.toLocaleString()}</code
              >
            </div>
          {:else}
            <p class="opacity-45">{m.source_audit_none_recorded()}</p>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
  {#if parameters &&
    typeof parameters === 'object' &&
    !Array.isArray(parameters) &&
    Object.keys(parameters).length}
    <details
      class="border-t border-current/10 px-4 py-3 text-sm"
      ontoggle={event => {
        if (event.currentTarget.open && declaration === undefined)
          void loadDeclaration()
      }}
    >
      <summary class="cursor-pointer text-xs opacity-50">
        <span
          >{bulk.id === 'retain-country-reference'
            ? m.source_audit_patch_details()
            : m.source_audit_rule_parameters()}</span
        >
        {#if 'exclusion' in parameters}
          <span class="float-right uppercase tracking-wide">
            {m.source_audit_exclusion_area()}
          </span>
        {/if}
      </summary>
      <div class="pt-3">
        {#if declaration !== undefined}
          {#if parameters &&
            typeof parameters === 'object' &&
            !Array.isArray(parameters) &&
            Object.keys(parameters).length}
            <RuleParameters {parameters} />
          {:else}
            <p class="text-sm opacity-65">{m.source_audit_no_parameters()}</p>
          {/if}
        {:else}
          {#if !failure}
            <Skeleton />
          {:else}
            <p>{failure}</p>
          {/if}
          {#if failure}
            <button type="button" class="underline" onclick={loadDeclaration}>
              {m.source_audit_retry_declaration()}
            </button>
          {/if}
        {/if}
      </div>
    </details>
  {/if}
  {#each bulk.id === 'retain-country-reference'
    ? []
    : evidence.fixtures as fixture, index}
    {@const group = groups?.[fixture.type]}
    {#if (!fixtureTypes || fixtureTypes.includes(fixture.type)) &&
      evidence.fixtures.findIndex(part => part.type === fixture.type) === index &&
      group &&
      catalogueGroupMatches(group, query)}
      <div class="relative border-t border-current/10">
        <div class="absolute right-4 top-2 z-10">
          <CopyRule
            kind="fixture"
            getRule={async () => {
              if (bulk.id === 'prepare-curated-division-edition')
                return getAuditFixtureGroup({
                  resourceReleaseId,
                  hash,
                  bulkId: evidence.id,
                  type: fixture.type,
                  q: '',
                })
              const documents = await Promise.all(
                evidence.fixtures.flatMap((part, partIndex) =>
                  part.type === fixture.type
                    ? [
                        getRetainedBulkFixture({
                          resourceReleaseId,
                          hash,
                          bulkId: evidence.id,
                          index: partIndex,
                        }),
                      ]
                    : [],
                ),
              )
              return documents.length === 1 ? documents[0] : documents
            }}
          />
        </div>
        <LazyFixture
          {resourceReleaseId}
          {hash}
          {query}
          {group}
          bulkId={evidence.id}
          type={fixture.type}
          label={fixture.type === 'statistic-fields'
            ? m.source_audit_statistical_fields()
            : fixture.type === 'statistic-measures'
              ? m.source_audit_statistical_measures()
              : fixture.type === 'identity-mappings'
                ? m.source_audit_identity_bridge()
                : label(fixture.type)}
        />
      </div>
    {/if}
  {/each}
  {@render footer?.()}
</article>
