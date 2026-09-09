<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { auditStatus } from './auditStatus'
import type { BulkAudit, Json } from '@repo/core/provenance'
import {
  getRetainedBulkFixture,
  getRetainedRuleDeclaration,
} from '#lib/registry/audit.remote.js'
import AuditFixture from './auditFixture.svelte'
import Skeleton from './auditApplicationSkeleton.svelte'
import CopyRule from './auditCopyRule.svelte'
import RuleParameters from './auditRuleParameters.svelte'
import {
  filterAuditFixture,
  auditFixtureRows,
  fixtureHasContents,
} from './auditFixtureRows'
const titles = () =>
  ({
    'curate-statistic-fields': m.source_audit_statistic_field_mappings(),
    'resolve-geography-identities': m.source_audit_identity_bridge(),
    'normalise-censtatd-statistics': m.source_audit_observation_normalisation(),
    normalise_censtatd_population_thousands_to_persons:
      m.source_audit_population_unit_conversion(),
  }) as Record<string, string>
const label = (value: string) =>
  value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
let {
  bulk,
  releaseId,
  hash,
  query = '',
  groups,
}: {
  bulk: BulkAudit
  releaseId: string
  hash: string
  query?: string
  groups?: Record<string, Json>
} = $props()
let fixtures = $derived(
  Object.fromEntries(
    bulk.fixtures.map((fixture, index) => [index, groups?.[fixture.type]]),
  ),
)
let failure = $state('')
let declaration = $state<Json>()
let parameters = $derived(
  declaration && typeof declaration === 'object' && !Array.isArray(declaration)
    ? declaration.parameters
    : null,
)
const filteredFixture = (value: Json | undefined) =>
  value === undefined ? undefined : filterAuditFixture(value, query)
const hasRows = (value: Json | undefined) =>
  value !== undefined && fixtureHasContents(value, query)
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
    <h4 class="text-base font-medium capitalize">
      {titles()[bulk.id] ?? label(bulk.id)}
    </h4>
    <div class="flex items-center gap-2">
      <span
        class={['rounded-full px-2 py-1 text-xs', bulk.outcome === 'applied' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500']}
        title={auditStatus(bulk.outcome)}
        >{auditStatus(bulk.outcome)}</span
      ><CopyRule
        getRule={() => getRetainedRuleDeclaration({ releaseId, hash, bulkId: bulk.id })}
      />
    </div>
  </header>
  <p class="border-t border-current/10 px-4 py-3 leading-relaxed opacity-65">
    {bulk.summary}
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
  {#each bulk.fixtures as fixture, index}
    {@const filtered = filteredFixture(fixtures[index])}
    {#if bulk.fixtures.findIndex(part => part.type === fixture.type) === index && hasRows(filtered)}
      <div class="relative border-t border-current/10">
        <div class="absolute right-4 top-2 z-10">
          <CopyRule
            kind="fixture"
            getRule={async () => {
          const documents = await Promise.all(bulk.fixtures.flatMap((part, partIndex) => part.type === fixture.type ? [getRetainedBulkFixture({releaseId, hash, bulkId: bulk.id, index: partIndex})] : []))
          return documents.length === 1 ? documents[0] : documents
        }}
          />
        </div>
        <details
          class="px-4 py-3"
          open={fixture.type === 'statistic-fields' || fixture.type === 'statistic-measures'}
        >
          <summary class="cursor-pointer pr-12 text-sm font-medium">
            {fixture.type === 'statistic-fields' ? m.source_audit_statistical_fields() : fixture.type === 'statistic-measures' ? m.source_audit_statistical_measures() : fixture.type === 'identity-mappings' ? m.source_audit_identity_bridge() : label(fixture.type)}
            {#if fixtures[index] !== undefined}
              <span class="ml-2 text-xs font-normal tabular-nums opacity-50"
                >{auditFixtureRows(filtered).length}
                / {auditFixtureRows(fixtures[index]).length}</span
              >
            {/if}
          </summary>
          <div class="mt-4 max-h-[640px] overflow-auto">
            {#if fixtures[index] !== undefined}
              <AuditFixture value={filtered ?? fixtures[index] ?? null} />
            {:else}
              {#if !failure}
                <Skeleton />
              {:else}
                <p class="text-sm">{failure}</p>
              {/if}
              {#if failure}
                <button
                  type="button"
                  class="text-sm underline"
                  onclick={loadDeclaration}
                >
                  {m.source_audit_retry_fixture()}
                </button>
              {/if}
            {/if}
          </div>
        </details>
      </div>
    {/if}
  {/each}
</article>
