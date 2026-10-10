<script lang="ts">
import type { Json } from '@repo/core/provenance'
import {
  auditObject,
  auditLabel,
  curationAction,
  divisionAuditTitle,
  divisionFixtureDescriptions,
} from './auditDivisionPresentation'
import IslandDecision from './auditIslandDecision.svelte'
import BoundarySource from './auditBoundarySource.svelte'
import NamePatch from './auditNamePatch.svelte'
import Geometry from './auditCurationGeometry.svelte'
import Hierarchy from './auditHierarchy.svelte'
import IslandGroup from './auditIslandGroup.svelte'
import Value from './auditDivisionValue.svelte'
let {
  value,
  type,
  showDescription = true,
  framed = true,
}: { value: Json; type: string; showDescription?: boolean; framed?: boolean } = $props()
let rows = $derived(
  Array.isArray(auditObject(value).entries)
    ? (auditObject(value).entries as Json[])
    : [],
)
let page = $state(0)
let expanded = $state<number[]>([])
$effect(() => {
  value
  page = 0
  expanded = []
})
let visible = $derived(rows.slice(page * 24, (page + 1) * 24))
</script>

{#if showDescription}
  <p class="mb-4 text-sm leading-relaxed opacity-60">
    {divisionFixtureDescriptions[type]}
  </p>
{/if}
<div
  class={framed
    ? 'overflow-hidden rounded-xl border border-current/15'
    : 'overflow-hidden'}
>
  {#each visible as entry, index (`${page}:${index}`)}
    {@const row = auditObject(entry)}
    {@const definition = auditObject(row.definition)}
    {@const fields = auditObject(row.fields)}
    <details
      class="border-b border-current/10 last:border-0"
      ontoggle={event => {
        expanded = event.currentTarget.open
          ? [...expanded, index]
          : expanded.filter(item => item !== index)
      }}
    >
      <summary
        class="flex min-h-24 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 hover:bg-current/5 [&::-webkit-details-marker]:hidden"
      >
        <span class="min-w-0 space-y-2">
          {#if type !== 'curation-definitions'}
            <span class="block text-xs capitalize opacity-50"
              >{type === 'prepared-division-changes'
                ? 'Preprocessed'
                : auditLabel(
                    String(row.section ?? row.operation ?? row.status ?? 'Definition'),
                  )}{row.collection
                ? ` · ${auditLabel(String(row.collection))}`
                : ''}</span
            >
          {/if}
          <span class="block wrap-anywhere text-base font-medium"
            >{divisionAuditTitle(entry)}</span
          >
          {#if definition.appliesFrom || definition.recordedIn}
            <span class="block text-xs opacity-50"
              >{definition.appliesFrom
                ? `Applies from ${definition.appliesFrom}`
                : `Recorded in ${String(definition.recordedIn).match(/\d{4}-\d{2}-\d{2}\.\d+$/)?.[0] ?? definition.recordedIn}`}</span
            >
          {/if}
          {#if (row.reason || definition.reason) &&
            (row.reason ?? definition.reason) !==
              'Retain reviewed ancestry where spatial evidence is incomplete.'}
            <span class="block text-sm opacity-65"
              >{String(row.reason ?? definition.reason)}</span
            >
          {/if}
        </span>
        <span class="max-w-[45%] shrink-0 text-right text-xs opacity-55">
          {type === 'prepared-division-changes'
            ? [...Object.keys(fields).map(auditLabel), 'names'].join(' · ')
            : curationAction(entry)}
          <span class="ml-2">{expanded.includes(index) ? '−' : '+'}</span>
        </span>
      </summary>
      {#if expanded.includes(index)}
        <div class="space-y-4 border-t border-current/10 bg-current/2.5 p-4 text-sm">
          {#if type === 'curation-definitions'}
            {@const feature = auditObject(definition.feature ?? definition)}
            {@const geometry = auditObject(feature.geometry)}
            {#if row.section === 'selections' && row.collection === 'entries'}
              <BoundarySource {definition} />
            {:else if row.section === 'exclusions' &&
              row.collection === 'islandDecisions'}
              <IslandDecision {definition} />
            {:else if row.section === 'selections' && row.collection === 'corrections'}
              {@const replacement = auditObject(row.boundaryPatch)}
              {#if replacement.geometry}
                <div class="grid items-start gap-4 md:grid-cols-2">
                  <Geometry
                    geometry={auditObject(replacement.geometry)}
                    title={divisionAuditTitle(entry)}
                  />
                  <div class="space-y-2">
                    <p>Replacement source geometry</p>
                    {#if Array.isArray(replacement.sourceRecordIds) &&
                      replacement.sourceRecordIds.length}
                      <p
                        class="opacity-65"
                        title={replacement.sourceRecordIds.join(', ')}
                      >
                        Source: Protomaps / OpenStreetMap
                      </p>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="opacity-65">
                  Uses a replacement upstream polygon. The resolved geometry was not
                  saved in this audit.
                </p>
              {/if}
            {:else if row.section === 'names' &&
              row.collection !== 'nameAliasRules' &&
              Object.keys(auditObject(definition.names)).length}
              <NamePatch {definition} />
            {:else if Array.isArray(row.pathNames)}
              <Hierarchy {definition} paths={row.pathNames} />
            {:else if row.memberNames}
              <IslandGroup {definition} members={auditObject(row.memberNames)} />
            {:else if Array.isArray(definition.point) &&
              definition.point.length === 2 &&
              definition.point.every(
                coordinate =>
                  typeof coordinate === 'number' && Number.isFinite(coordinate),
              )}
              <p class="break-all font-mono text-xs opacity-50">
                {String(definition.divisionId ?? definition.id ?? '')}
              </p>
              <div class="grid items-stretch gap-4 md:grid-cols-2">
                <div class="min-w-0">
                  <Value
                    value={Object.fromEntries(
                      Object.entries(definition).filter(
                        ([key]) =>
                          ![
                            'id',
                            'divisionId',
                            'review',
                            'reason',
                            'recordedIn',
                            'appliesFrom',
                            'appliesUntil',
                          ].includes(key),
                      ),
                    )}
                  />
                </div>
                <div class="relative min-h-72 min-w-0">
                  {#await import('./auditCurationPoint.svelte')}
                    <div
                      class="flex h-72 items-center justify-center text-sm opacity-60"
                    >
                      Loading map…
                    </div>
                  {:then module}
                    <module.default
                      point={definition.point as [number, number]}
                      title={divisionAuditTitle(entry)}
                    />
                  {:catch}
                    <p class="text-sm opacity-60">Map could not be loaded.</p>
                  {/await}
                </div>
              </div>
            {:else if ['Polygon', 'MultiPolygon'].includes(String(geometry.type)) &&
              Array.isArray(geometry.coordinates)}
              <div class="grid items-start gap-4 md:grid-cols-2">
                <div class="min-w-0 md:sticky md:top-0">
                  <Geometry {geometry} title={divisionAuditTitle(entry)} />
                </div>
                <div class="min-w-0"><Value value={row.definition ?? entry} /></div>
              </div>
            {:else}
              <Value value={row.definition ?? entry} />
            {/if}
          {:else}
            <p class="break-all font-mono text-xs opacity-50">
              {String(row.id ?? row.divisionId)}
            </p>
            {#each type === 'prepared-division-changes'
              ? Object.entries({ ...fields, names: row.names })
              : [
                  [
                    String(row.field ?? 'Record'),
                    { before: row.before, after: row.proposed },
                  ],
                ] as [field, change]}
              {@const pair = auditObject(change)}
              <section class="space-y-2">
                <h5 class="font-medium capitalize">
                  {field === '$record' ? 'Division record' : auditLabel(String(field))}
                </h5>
                <div
                  class="grid gap-4 rounded-lg border border-current/10 p-3 sm:grid-cols-2"
                >
                  {#each ['before', 'after'] as side}
                    <div class="min-w-0 space-y-2">
                      <p class="text-xs uppercase opacity-40">
                        {type !== 'prepared-division-changes'
                          ? side === 'after'
                            ? 'Proposed'
                            : 'Before'
                          : side === 'after'
                            ? 'After · SaanSeoi'
                            : auditObject(row.comparison).kind === 'combined-inputs' ||
                                (!row.comparison && row.operation === 'include')
                              ? 'Source comparison unavailable'
                              : 'Before · Overture source'}
                      </p>
                      {#if side === 'before' &&
                        type === 'prepared-division-changes' &&
                        (auditObject(row.comparison).kind === 'combined-inputs' ||
                          (!row.comparison && row.operation === 'include'))}
                        <p class="text-sm opacity-50">
                          No single source record was saved for comparison.
                        </p>
                      {:else if side === 'before' &&
                        type === 'prepared-division-changes' &&
                        field === 'hierarchies' &&
                        !('publisherHierarchy' in row)}
                        <p class="text-sm opacity-50">
                          Overture’s original hierarchy was not saved in this audit. It
                          cannot be compared here.
                        </p>
                      {:else}
                        <Value value={pair[side] ?? null} />
                      {/if}
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
            {#if row.fingerprint}
              <details>
                <summary class="cursor-pointer text-xs opacity-50">
                  Decision fingerprint
                </summary>
                <p class="mt-2 break-all font-mono text-xs opacity-50">
                  {String(row.fingerprint)}
                </p>
              </details>
            {/if}
          {/if}
        </div>
      {/if}
    </details>
  {/each}
</div>
{#if rows.length > 24}
  <nav
    aria-label="Audit record pages"
    class="mt-3 flex items-center justify-between text-sm"
  >
    <button
      type="button"
      class="cursor-pointer rounded border border-current/15 px-3 py-2 disabled:opacity-30"
      disabled={page === 0}
      onclick={() => {
        page--
        expanded = []
      }}
    >
      Previous
    </button>
    <span class="text-xs tabular-nums opacity-60"
      >{page * 24 + 1}–{Math.min((page + 1) * 24, rows.length)}
      of {rows.length.toLocaleString()}</span
    >
    <button
      type="button"
      class="cursor-pointer rounded border border-current/15 px-3 py-2 disabled:opacity-30"
      disabled={(page + 1) * 24 >= rows.length}
      onclick={() => {
        page++
        expanded = []
      }}
    >
      Next
    </button>
  </nav>
{/if}
