<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import StatusBadge from './auditStatusBadge.svelte'
import type { BulkAudit, Json } from '@repo/core/provenance'
import {
  getRetainedBulkFixture,
  getRetainedRuleDeclaration,
} from '#lib/registry/audit.remote.js'
import LazyFixture from './auditLazyFixture.svelte'
import Skeleton from './auditApplicationSkeleton.svelte'
import CopyRule from './auditCopyRule.svelte'
import RuleParameters from './auditRuleParameters.svelte'
import { catalogueGroupMatches, type FixtureSearchGroup } from './auditFixtureCatalogue'
import { auditRuleCopy } from './auditRuleCopy'
const titles = () =>
  ({
    'select-landsd-settlements': m.source_audit_landsd_settlements_title(),
    'prepare-als-addresses': m.source_audit_als_prepare_title(),
    'normalise-als-addresses': m.source_audit_als_normalise_title(),
    'curate-statistic-fields': m.source_audit_statistic_field_mappings(),
    'resolve-geography-identities': m.source_audit_identity_bridge(),
    'normalise-censtatd-statistics': m.source_audit_observation_normalisation(),
    normalise_censtatd_population_thousands_to_persons:
      m.source_audit_population_unit_conversion(),
  }) as Record<string, string>
const labels = (): Record<string, string> => ({
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
const title = (value: string) =>
  label(value).replace(/\b[a-z]/g, character => character.toUpperCase())
let {
  bulk,
  releaseId,
  hash,
  query = '',
  groups,
  evidence = bulk,
}: {
  bulk: BulkAudit
  evidence?: BulkAudit
  releaseId: string
  hash: string
  query?: string
  groups?: Record<string, FixtureSearchGroup>
} = $props()
let failure = $state('')
let declaration = $state<Json>()
let parameters = $derived(
  declaration && typeof declaration === 'object' && !Array.isArray(declaration)
    ? declaration.parameters
    : null,
)
$effect(() => {
  releaseId
  hash
  bulk.id
  void loadDeclaration()
})
async function loadDeclaration() {
  try {
    declaration = await getRetainedRuleDeclaration({ releaseId, hash, bulkId: bulk.id })
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
      {auditRuleCopy(bulk.id)?.title ?? titles()[bulk.id] ?? title(bulk.id)}
    </h4>
    <div class="flex items-center gap-2">
      {#if bulk.id === 'normalise-als-addresses'}
        <span class="rounded-full border border-current/15 px-2 py-1 text-xs opacity-65"
          >{m.source_audit_als_depends_on({ rule: m.source_audit_als_prepare_title() })}</span
        >
      {/if}
      <StatusBadge status={bulk.outcome} />
      <CopyRule
        getRule={() => getRetainedRuleDeclaration({ releaseId, hash, bulkId: bulk.id })}
      />
    </div>
  </header>
  <p class="border-t border-current/10 px-4 py-3 leading-relaxed opacity-65">
    {bulk.id === 'prepare-als-addresses'
      ? m.source_audit_als_prepare_summary()
      : bulk.id === 'normalise-als-addresses'
        ? m.source_audit_als_normalise_summary()
        : auditRuleCopy(bulk.id)?.summary ?? bulk.summary}
  </p>
  <div class="grid grid-cols-2 border-t border-current/10">
    {#each [{title: m.source_audit_input(), counts: bulk.counts.inputs}, {title: m.source_audit_output(), counts: bulk.counts.outputs}] as side}
      <div class="space-y-2 px-4 py-3 first:border-r first:border-current/10">
        <p class="text-xs uppercase opacity-45">{side.title}</p>
        {#each Object.entries(side.counts) as [name, count]}
          <div class="flex flex-wrap justify-between gap-2">
            <span class="capitalize opacity-65">{label(name)}</span
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
  {#if parameters && typeof parameters === 'object' && !Array.isArray(parameters) && Object.keys(parameters).length}
    <details
      class="border-t border-current/10 px-4 py-3 text-sm"
      open={parameters.exclusion !== null && typeof parameters.exclusion === 'object' && !Array.isArray(parameters.exclusion) && (parameters.exclusion.type === 'Polygon' || parameters.exclusion.type === 'MultiPolygon') && Array.isArray(parameters.exclusion.coordinates)}
      ontoggle={event => { if (event.currentTarget.open && declaration === undefined) void loadDeclaration() }}
    >
      <summary class="cursor-pointer text-xs opacity-50">
        <span>{m.source_audit_rule_parameters()}</span>
        {#if 'exclusion' in parameters}
          <span class="float-right uppercase tracking-wide">
            {m.source_audit_exclusion_area()}
          </span>
        {/if}
      </summary>
      <div class="pt-3">
        {#if declaration !== undefined}
          {#if parameters && typeof parameters === 'object' && !Array.isArray(parameters) && Object.keys(parameters).length}
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
  {#each evidence.fixtures as fixture, index}
    {@const group = groups?.[fixture.type]}
    {#if evidence.fixtures.findIndex(part => part.type === fixture.type) === index && group && catalogueGroupMatches(group, query)}
      <div class="relative border-t border-current/10">
        <div class="absolute right-4 top-2 z-10">
          <CopyRule
            kind="fixture"
            getRule={async () => {
          const documents = await Promise.all(evidence.fixtures.flatMap((part, partIndex) => part.type === fixture.type ? [getRetainedBulkFixture({releaseId, hash, bulkId: evidence.id, index: partIndex})] : []))
          return documents.length === 1 ? documents[0] : documents
        }}
          />
        </div>
        <LazyFixture
          {releaseId}
          {hash}
          {query}
          {group}
          bulkId={evidence.id}
          type={fixture.type}
          label={fixture.type === 'statistic-fields' ? m.source_audit_statistical_fields() : fixture.type === 'statistic-measures' ? m.source_audit_statistical_measures() : fixture.type === 'identity-mappings' ? m.source_audit_identity_bridge() : label(fixture.type)}
        />
      </div>
    {/if}
  {/each}
</article>
