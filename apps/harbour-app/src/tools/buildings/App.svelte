<script lang="ts">
import { onMount } from 'svelte'
import BuildingMap from './BuildingMap.svelte'
import MatchDetail from './MatchDetail.svelte'
import { emptyCollection, labels } from './types'
import type { RecordDetail, ReviewRow, Selection, Summary } from './types'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
let summary = $state<Summary | null>(null)
let rows = $state<ReviewRow[]>([]),
  total = $state(0),
  offset = $state(0),
  category = $state(''),
  query = $state('')
let detail = $state<RecordDetail | null>(null),
  active = $state(0),
  error = $state(''),
  mapError = $state(''),
  loading = $state(false)
let landsd = $state<FeatureCollection>(emptyCollection()),
  overture = $state<FeatureCollection>(emptyCollection())
let showLandsd = $state(true),
  showOverture = $state(true),
  opacity = $state(0.2),
  radius = $state(250)
let center = $state({ lng: 114.1704, lat: 22.3071 })
let decisions = $state<
  Record<
    string,
    {
      value: string
      landsdId: string
      overtureId: string
      landsdCoverage: number
      overtureCoverage: number
      at: string
    }
  >
>({})
let listGeneration = 0,
  selectionGeneration = 0,
  nearbyController: AbortController | undefined
const storageKey = 'saanseoi-building-review:landsd-2026-09-21:overture-2026-09-23.1'
const highlight = $derived.by(() => {
  if (!detail) return emptyCollection()
  const features: Feature[] = [
    {
      type: 'Feature',
      id: detail.selected.id,
      geometry: JSON.parse(detail.selected.geometry) as Geometry,
      properties: { inventory: detail.inventory },
    },
  ]
  const match = detail.matches[active]
  if (match)
    features.push({
      type: 'Feature',
      id: detail.inventory === 'landsd' ? match.overtureId : match.landsdId,
      geometry: JSON.parse(match.geometry) as Geometry,
      properties: { inventory: detail.inventory === 'landsd' ? 'overture' : 'landsd' },
    })
  return { type: 'FeatureCollection', features } as FeatureCollection
})
const decisionKey = $derived(
  detail?.matches[active]
    ? `${detail.matches[active].landsdId}|${detail.matches[active].overtureId}`
    : '',
)

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/__buildings/${path}`, { signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Unable to load buildings')
  return data as T
}
async function loadList(): Promise<void> {
  const generation = ++listGeneration
  try {
    const data = await read<{ rows: ReviewRow[]; total: number }>(
      `list?status=${encodeURIComponent(category)}&query=${encodeURIComponent(query)}&offset=${offset}`,
    )
    if (generation === listGeneration) {
      rows = data.rows
      total = data.total
    }
  } catch (e) {
    if (generation === listGeneration) error = String(e)
  }
}
async function select(selection: Selection): Promise<void> {
  const generation = ++selectionGeneration
  try {
    const result = await read<RecordDetail>(
      `record?inventory=${selection.inventory}&id=${encodeURIComponent(selection.id)}`,
    )
    if (generation === selectionGeneration) {
      detail = result
      active = 0
      error = ''
    }
  } catch (e) {
    if (generation === selectionGeneration) error = String(e)
  }
}
async function loadNearby(): Promise<void> {
  nearbyController?.abort()
  const controller = new AbortController()
  nearbyController = controller
  loading = true
  try {
    const suffix = `lng=${center.lng}&lat=${center.lat}&radius=${radius}`
    const [a, b] = await Promise.all([
      read<FeatureCollection>(`nearby?inventory=landsd&${suffix}`, controller.signal),
      read<FeatureCollection>(`nearby?inventory=overture&${suffix}`, controller.signal),
    ])
    if (!controller.signal.aborted) {
      landsd = a
      overture = b
      error = ''
    }
  } catch (e) {
    if (!controller.signal.aborted) error = String(e)
  } finally {
    if (!controller.signal.aborted) loading = false
  }
}
function decide(value: 'accept' | 'reject' | 'skip'): void {
  const match = detail?.matches[active]
  if (!match) return
  decisions = {
    ...decisions,
    [decisionKey]: {
      value,
      landsdId: match.landsdId,
      overtureId: match.overtureId,
      landsdCoverage: match.landsdCoverage,
      overtureCoverage: match.overtureCoverage,
      at: new Date().toISOString(),
    },
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(decisions))
  } catch (e) {
    error = `Could not persist decision: ${String(e)}`
  }
}
function exportDecisions(): void {
  const payload = {
    releases: summary?.releases,
    inventoriesSeparate: true,
    assignsIds: false,
    decisions: Object.values(decisions),
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'building-comparison-decisions.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$effect(() => {
  category
  query
  offset
  const timer = setTimeout(() => void loadList(), 200)
  return () => clearTimeout(timer)
})
$effect(() => {
  center
  radius
  const timer = setTimeout(() => void loadNearby(), 250)
  return () => clearTimeout(timer)
})
onMount(() => {
  void read<Summary>('summary')
    .then(data => (summary = data))
    .catch(e => (error = String(e)))
  try {
    decisions = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
  } catch {
    error = 'Saved review decisions could not be read.'
  }
  return () => nearbyController?.abort()
})
</script>

<div class="flex h-dvh overflow-hidden bg-slate-950 text-slate-100">
  <aside
    class="z-10 flex h-full w-[390px] min-w-[310px] shrink-0 flex-col border-r border-slate-700 bg-slate-950 shadow-xl max-sm:w-[310px]"
  >
    <header class="shrink-0 p-4">
      <div class="flex items-center justify-between">
        <a href="/" class="text-xs text-cyan-300 hover:underline">← Harbour</a
        ><button
          type="button"
          onclick={exportDecisions}
          class="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
        >
          Export decisions ({Object.keys(decisions).length})
        </button>
      </div>
      <h1 class="mt-3 text-2xl font-semibold tracking-tight">Building comparison</h1>
      <p class="mt-1 text-sm text-slate-400">
        Separate inventories · shared comparison view
      </p>
      {#if summary}
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg border border-cyan-900 bg-cyan-950/30 p-2">
            <strong class="block text-cyan-300"
              >LandsD · {summary.counts.landsd.toLocaleString()}</strong
            ><span class="text-slate-400">{summary.releases.landsd}</span>
          </div>
          <div class="rounded-lg border border-orange-900 bg-orange-950/30 p-2">
            <strong class="block text-orange-300"
              >Overture · {summary.counts.overture.toLocaleString()}</strong
            ><span class="text-slate-400">{summary.releases.overture}</span>
          </div>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-slate-400">
          <strong class="text-slate-200"
            >{((100 * summary.mutualOver99Percent) / summary.counts.landsd).toFixed(
              2,
            )}%</strong
          >
          mutual &gt;99% ·
          <strong class="text-slate-200"
            >{(
              (100 * summary.partialOnlyOver99Percent) /
              summary.counts.landsd
            ).toFixed(2)}%</strong
          >
          partial only. Geometry evidence does not assign IDs.
        </p>
      {/if}
      <label class="mt-3 block text-xs text-slate-400" for="category"
        >LandsD overlap category</label
      >
      <select
        id="category"
        bind:value={category}
        onchange={() => (offset = 0)}
        class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
      >
        {#each Object.entries(labels) as [value, label]}
          <option {value}>
            {label}{summary && value
              ? ` (${summary.reviewCategories[value].toLocaleString()})`
              : ''}
          </option>
        {/each}
      </select>
      <input
        aria-label="Search LandsD name or CSU ID"
        placeholder="Name or BuildingCSUID…"
        bind:value={query}
        oninput={() => (offset = 0)}
        class="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
      >
      <div class="mt-2 flex justify-between text-xs text-slate-400">
        <span>{total.toLocaleString()} records</span>
        <div class="flex gap-3">
          <button
            type="button"
            aria-label="Previous page"
            disabled={offset === 0}
            onclick={() => (offset = Math.max(0, offset - 40))}
            class="disabled:opacity-30"
          >
            ← Previous
          </button><button
            type="button"
            aria-label="Next page"
            disabled={offset + 40 >= total}
            onclick={() => (offset += 40)}
            class="disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </header>
    <section
      class="min-h-[120px] flex-1 overflow-y-auto border-t border-slate-800"
      aria-label="LandsD review records"
    >
      {#each rows as row}
        <button
          type="button"
          onclick={() => void select({ inventory: 'landsd', id: row.id })}
          class={`block w-full border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-800 ${detail?.selected.id === row.id ? 'bg-slate-800' : 'bg-transparent'}`}
        >
          <span class="block text-sm font-medium">{row.name || 'Unnamed building'}</span
          ><span class="mt-1 block font-mono text-xs text-slate-500">{row.id}</span
          ><span class="mt-1 block text-xs text-cyan-200/80">{labels[row.status]}</span>
        </button>
      {:else}
        <p class="p-4 text-sm text-slate-400">No records match this filter.</p>
      {/each}
    </section>
    {#if detail}
      <div class="max-h-[52vh] shrink-0 overflow-auto">
        <MatchDetail
          {detail}
          {active}
          onMatch={index => (active = index)}
          onDecision={decide}
          decision={decisions[decisionKey]?.value ?? ''}
        />
      </div>
    {/if}
  </aside>
  <main class="relative min-w-0 flex-1">
    <BuildingMap
      {landsd}
      {overture}
      {highlight}
      {showLandsd}
      {showOverture}
      {opacity}
      onSelect={value => void select(value)}
      onCenter={(lng, lat) => (center = { lng, lat })}
      onError={value => (mapError = value)}
    />
    <div
      class="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl"
    >
      <label class="flex items-center gap-2 text-cyan-300"
        ><input type="checkbox" bind:checked={showLandsd} class="accent-cyan-400">LandsD
        ({landsd.features.length})</label
      >
      <label class="flex items-center gap-2 text-orange-300"
        ><input
          type="checkbox"
          bind:checked={showOverture}
          class="accent-orange-400"
        >Overture ({overture.features.length})</label
      >
      <label class="flex items-center gap-2 text-slate-300"
        >Radius<select
          aria-label="Nearby radius"
          bind:value={radius}
          class="rounded-md border border-slate-700 bg-slate-900 p-1"
        >
          {#each [100, 250, 500, 1000] as value}
            <option {value}>{value} m</option>
          {/each}
        </select></label
      >
      <label class="flex items-center gap-2 text-slate-400"
        >Fill<input
          aria-label="Footprint fill opacity"
          type="range"
          min="0"
          max="0.6"
          step="0.05"
          bind:value={opacity}
          class="w-20 accent-slate-400"
        ></label
      >
      <span role="status" class="ml-auto text-xs text-slate-400"
        >{loading
          ? 'Loading nearby footprints…'
          : 'Pan to explore · click a footprint'}</span
      >
    </div>
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full border-2 border-white bg-slate-950/50 shadow-lg"
    ></div>
    {#if error || mapError}
      <div
        role="alert"
        class="absolute bottom-8 left-4 max-w-xl rounded-lg border border-amber-800 bg-slate-950/95 p-3 text-sm text-amber-200"
      >
        {error || mapError}
      </div>
    {/if}
    <div
      class="absolute bottom-8 right-14 rounded-lg bg-slate-950/90 px-3 py-2 text-xs text-slate-400"
    >
      Cyan: LandsD · Orange: Overture · EPSG:2326 overlap areas
    </div>
  </main>
</div>
