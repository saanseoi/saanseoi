<script lang="ts">
import { onMount } from 'svelte'
import ReviewNavigation from './ReviewNavigation.svelte'
import ReviewProgress from './ReviewProgress.svelte'
import ProductionReviewQueue from './ProductionReviewQueue.svelte'
import {
  tableKey,
  needsProductionReview,
  readProductionReviews,
  productionReviewStorageKey,
  type ProductionReviews,
  type ProductionReview,
} from './productionReviews'
import SamplePanel from './SamplePanel.svelte'
import NullSummary from './NullSummary.svelte'
import ReviewHeader from './ReviewHeader.svelte'
import {
  isApproved,
  readSignoffs,
  signoffStorageKey,
  viewKey,
  type Signoffs,
} from './signoffs'
import type { Group, Table, Inspection, Subset } from './types'
let kind = $state('META')
let group = $state('')
let table = $state('')
let subset = $state('')
let groups = $state<Group[]>([])
let tables = $state<Table[]>([])
let subsets = $state<Subset[]>([])
let missing = $state<string[]>([])
let limit = $state(8)
let revision = $state('')
let data = $state<Inspection | null>(null)
let summary = $state<Inspection | null>(null)
let loading = $state(false)
let counting = $state(false)
let navigating = $state(false)
let error = $state('')
let summaryError = $state('')
let storageError = $state('')
let notice = $state('')
let signoffs = $state<Signoffs>({})
let productionReviews = $state<ProductionReviews>({})
const productionReview = $derived(
  needsProductionReview(productionReviews, kind, group, table),
)
const productionEntries = $derived(
  Object.values(productionReviews).sort((a, b) => a.markedAt.localeCompare(b.markedAt)),
)
let controller: AbortController | undefined
let planController: AbortController | undefined
const key = $derived(viewKey(kind, group, table, subset))
const approved = $derived(isApproved(signoffs, key, revision))
const canApprove = $derived(
  Boolean(
    data &&
      summary &&
      data.stable &&
      summary.stable &&
      data.revision === summary.revision &&
      data.revision === revision &&
      !error &&
      !summaryError,
  ),
)

async function get<T>(
  action: string,
  signal: AbortSignal,
  selection: { group?: string; table?: string; subset?: string } = {},
): Promise<T> {
  const params = new URLSearchParams({
    kind,
    group,
    table,
    subset,
    limit: String(limit),
    ...selection,
  })
  const response = await fetch(`/api/review/${action}?${params}`, { signal })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Could not load local data')
  return body
}
const tablePlans = new Map<string, Table[]>()
const subsetPlans = new Map<string, Subset[]>()
async function plannedTables(targetGroup: string, signal: AbortSignal) {
  const cacheKey = JSON.stringify([kind, targetGroup, revision])
  const cached = tablePlans.get(cacheKey)
  if (cached) return cached
  const value = await get<Table[]>('tables', signal, { group: targetGroup })
  if (!signal.aborted) tablePlans.set(cacheKey, value)
  return value
}
async function plannedSubsets(
  targetGroup: string,
  targetTable: string,
  signal: AbortSignal,
) {
  const cacheKey = JSON.stringify([kind, targetGroup, targetTable, revision])
  const cached = subsetPlans.get(cacheKey)
  if (cached) return cached
  const value = await get<Subset[]>('subsets', signal, {
    group: targetGroup,
    table: targetTable,
  })
  if (!signal.aborted) subsetPlans.set(cacheKey, value)
  return value
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
function save() {
  try {
    localStorage.setItem(signoffStorageKey, JSON.stringify(signoffs))
    localStorage.setItem(productionReviewStorageKey, JSON.stringify(productionReviews))
    storageError = ''
  } catch {
    storageError =
      'Could not save review progress. Keep this page open or enable browser storage.'
  }
}
function approvalLabel(target: string, slice: string) {
  if (needsProductionReview(productionReviews, kind, group, target))
    return ' · Production review'
  return isApproved(signoffs, viewKey(kind, group, target, slice), revision)
    ? ' ✓ Signed off'
    : ''
}
async function loadSamples() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  data = null
  summary = null
  error = ''
  summaryError = ''
  notice = ''
  loading = true
  counting = true
  await Promise.all([
    get<Inspection>('samples', current.signal)
      .then(value => {
        if (!current.signal.aborted) {
          data = value
          revision = value.revision
        }
      })
      .catch(e => {
        if (!current.signal.aborted) error = message(e)
      })
      .finally(() => {
        if (!current.signal.aborted) loading = false
      }),
    get<Inspection>('summary', current.signal)
      .then(value => {
        if (!current.signal.aborted) summary = value
      })
      .catch(e => {
        if (!current.signal.aborted) summaryError = message(e)
      })
      .finally(() => {
        if (!current.signal.aborted) counting = false
      }),
  ])
  if (!current.signal.aborted) checkConsistency()
}
function checkConsistency() {
  if (
    data &&
    summary &&
    (!data.stable || !summary.stable || data.revision !== summary.revision)
  )
    notice =
      'The local data changed while this view loaded. Refresh samples before signing off.'
}

function startPlan() {
  planController?.abort()
  controller?.abort()
  const current = new AbortController()
  planController = current
  navigating = true
  loading = false
  counting = false
  data = null
  summary = null
  error = ''
  notice = ''
  return current
}
async function show(
  targetGroup: string,
  targetTable: string,
  targetSubset: string,
  availableTables: Table[],
  availableSubsets: Subset[],
  signal: AbortSignal,
) {
  if (signal.aborted) return
  group = targetGroup
  table = targetTable
  subset = targetSubset
  tables = availableTables
  subsets = availableSubsets
  navigating = false
  await loadSamples()
}
// Walk only populated group/table/subset combinations. The planner loads each
// table's subsets as needed instead of constructing a Cartesian product.
async function seek(
  direction: number,
  level: 'group' | 'table' | 'view',
  onlyPending = true,
  initial = false,
) {
  const current = startPlan()
  try {
    const currentGroupIndex = groups.findIndex(g => g.id === group)
    const startGroup = initial ? 0 : Math.max(0, currentGroupIndex)
    for (let gi = startGroup; gi >= 0 && gi < groups.length; gi += direction) {
      if (!initial && level === 'group' && gi === startGroup) continue
      const targetGroup = groups[gi].id
      const availableTables = await plannedTables(targetGroup, current.signal)
      const sameGroup = targetGroup === group
      let startTable =
        sameGroup && !initial
          ? Math.max(
              0,
              availableTables.findIndex(t => t.name === table),
            )
          : direction > 0
            ? 0
            : availableTables.length - 1
      for (
        let ti = startTable;
        ti >= 0 && ti < availableTables.length;
        ti += direction
      ) {
        if (
          !initial &&
          sameGroup &&
          level === 'table' &&
          availableTables[ti].name === table
        )
          continue
        const targetTable = availableTables[ti].name
        if (
          onlyPending &&
          needsProductionReview(productionReviews, kind, targetGroup, targetTable)
        )
          continue
        const availableSubsets = await plannedSubsets(
          targetGroup,
          targetTable,
          current.signal,
        )
        const views = ['', ...availableSubsets.map(s => s.id)]
        const sameTable = sameGroup && targetTable === table
        let vi =
          sameTable && !initial && level === 'view'
            ? views.indexOf(subset) + direction
            : direction > 0
              ? 0
              : views.length - 1
        for (; vi >= 0 && vi < views.length; vi += direction) {
          if (
            onlyPending &&
            isApproved(
              signoffs,
              viewKey(kind, targetGroup, targetTable, views[vi]),
              revision,
            )
          )
            continue
          await show(
            targetGroup,
            targetTable,
            views[vi],
            availableTables,
            availableSubsets,
            current.signal,
          )
          return
        }
      }
    }
    if (!current.signal.aborted) {
      notice = onlyPending
        ? 'No more unreviewed views in this direction for this shard type.'
        : 'No more views in this direction.'
      navigating = false
      if (table) await loadSamples()
    }
  } catch (e) {
    if (!current.signal.aborted) {
      error = message(e)
      navigating = false
    }
  }
}
async function selectTable(value: string) {
  const current = startPlan()
  table = value
  subset = ''
  subsets = []
  try {
    const slices = await plannedSubsets(group, value, current.signal)
    await show(group, value, '', tables, slices, current.signal)
  } catch (e) {
    if (!current.signal.aborted) {
      error = message(e)
      navigating = false
    }
  }
}
async function selectGroup(value: string, targetTable?: string) {
  const current = startPlan()
  group = value
  table = ''
  subset = ''
  tables = []
  subsets = []
  try {
    const available = await plannedTables(value, current.signal)
    if (current.signal.aborted) return
    tables = available
    if (!available.length) {
      navigating = false
      notice = 'No populated related tables are available.'
      return
    }
    const chosen = targetTable
      ? available.find(t => t.name === targetTable)
      : available[0]
    if (!chosen) {
      navigating = false
      notice =
        'This queued table has no populated local view. It remains pending production review.'
      return
    }
    const slices = await plannedSubsets(value, chosen.name, current.signal)
    await show(value, chosen.name, '', available, slices, current.signal)
  } catch (e) {
    if (!current.signal.aborted) {
      error = message(e)
      navigating = false
    }
  }
}
async function selectKind(value: string, target?: ProductionReview) {
  const current = startPlan()
  kind = value
  group = ''
  table = ''
  subset = ''
  groups = []
  tables = []
  subsets = []
  missing = []
  revision = ''
  try {
    const result = await get<{ groups: Group[]; missing: string[]; revision: string }>(
      'catalogue',
      current.signal,
    )
    if (current.signal.aborted) return
    groups = result.groups
    missing = result.missing
    revision = result.revision
    if (target) {
      if (groups.some(g => g.id === target.group))
        await selectGroup(target.group, target.table)
      else {
        navigating = false
        notice =
          'This queued group has no populated local view. It remains pending production review.'
      }
    } else if (groups.length) await seek(1, 'view', true, true)
    else navigating = false
  } catch (e) {
    if (!current.signal.aborted) {
      error = message(e)
      navigating = false
    }
  }
}
function markProductionReview() {
  if (!table || navigating) return
  const entry: ProductionReview = {
    kind,
    group,
    groupLabel: groups.find(g => g.id === group)?.label ?? group,
    table,
    markedAt: new Date().toISOString(),
  }
  productionReviews = { ...productionReviews, [tableKey(kind, group, table)]: entry }
  save()
  void seek(1, 'view', true)
}
function removeProductionReview(entry: ProductionReview) {
  const next = { ...productionReviews }
  delete next[tableKey(entry.kind, entry.group, entry.table)]
  productionReviews = next
  save()
}
function approve() {
  if (!canApprove || productionReview) return
  signoffs = { ...signoffs, [key]: { revision, signedAt: new Date().toISOString() } }
  save()
  void seek(1, 'view', true)
}
function undo() {
  const next = { ...signoffs }
  delete next[key]
  signoffs = next
  save()
}
onMount(() => {
  try {
    signoffs = readSignoffs(localStorage.getItem(signoffStorageKey))
    productionReviews = readProductionReviews(
      localStorage.getItem(productionReviewStorageKey),
    )
  } catch {
    storageError =
      'Browser storage is unavailable; progress will last only for this session.'
  }
  const update = (event: StorageEvent) => {
    if (event.key === signoffStorageKey) signoffs = readSignoffs(event.newValue)
    if (event.key === productionReviewStorageKey)
      productionReviews = readProductionReviews(event.newValue)
  }
  window.addEventListener('storage', update)
  void selectKind(kind)
  return () => {
    controller?.abort()
    planController?.abort()
    window.removeEventListener('storage', update)
  }
})
</script>

<main
  class="mx-auto min-h-screen max-w-screen-2xl space-y-7 bg-surface px-4 pb-28 text-foreground sm:px-8"
>
  <ReviewHeader>
    <ReviewNavigation
      {kind}
      {group}
      {table}
      {groups}
      {tables}
      {limit}
      {subset}
      {subsets}
      {approvalLabel}
      onSubset={value => {
        subset = value
        notice = ''
        void loadSamples()
      }}
      onMove={seek}
      busy={loading || navigating}
      onKind={selectKind}
      onGroup={selectGroup}
      onTable={selectTable}
      onLimit={value => {
        limit = value
        void loadSamples()
      }}
      onRefresh={loadSamples}
    />
  </ReviewHeader>
  {#if missing.length}
    <p role="status">
      Unavailable local shards: {missing.join(', ')}. Review covers available shards
      only.
    </p>
  {/if}
  {#if loading || navigating}
    <p role="status">Loading samples…</p>
  {:else if error}
    <p role="alert" class="text-red-700 dark:text-red-400">{error}</p>
  {:else if data}
    {#key `${kind}/${group}/${table}/${subset}`}
      <SamplePanel {data} />
    {/key}
  {:else}
    <p>{notice || 'No review groups are available.'}</p>
  {/if}
  <NullSummary data={summary} loading={counting} error={summaryError} />
</main>

<ReviewProgress
  {approved}
  {productionReview}
  canMarkProduction={Boolean(table && !navigating)}
  onProduction={markProductionReview}
  onReturnToLocal={() => {
    const entry = productionReviews[tableKey(kind, group, table)]
    if (entry) removeProductionReview(entry)
  }}
  {canApprove}
  busy={navigating}
  {storageError}
  {notice}
  onApprove={approve}
  onUndo={undo}
  onNext={() => {
    void seek(1, 'view', true)
  }}
/>

<ProductionReviewQueue
  entries={productionEntries}
  onOpen={entry => {
    void selectKind(entry.kind, entry)
  }}
  onRemove={removeProductionReview}
/>
