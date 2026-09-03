<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import { urbanDensityDivisionsResponse } from './urbanDensityExampleData.ts'

const divisions = urbanDensityDivisionsResponse.data
const included = urbanDensityDivisionsResponse.included

type Geometry = Extract<
  (typeof included)[number],
  { type: 'division-areas' }
>['attributes']['geometry']

let selectedDivisionCode = $state(divisions[0]?.attributes.divisionCode ?? '')
let selectedIncludedId = $state(included[0]?.id ?? '')

const selectedDivision = $derived(
  divisions.find(division => division.attributes.divisionCode === selectedDivisionCode),
)
const selectedIncluded = $derived(
  included.find(resource => resource.id === selectedIncludedId),
)

const areaName = (division: (typeof divisions)[number]) =>
  division.relationships.hierarchy.data.find(item => item.meta.subType === 'area')?.meta
    .name ?? '—'

const isGeometryResource = (
  resource: (typeof included)[number],
): resource is Extract<(typeof included)[number], { type: 'division-areas' }> =>
  resource.type === 'division-areas'

const divisionName = (code: string) =>
  divisions.find(division => division.attributes.divisionCode === code)?.attributes.i18n
    .en.name ?? code

const includedLabel = (resource: (typeof included)[number]) =>
  isGeometryResource(resource)
    ? resource.attributes.divisionCode
    : (resource.attributes.divisionCode ?? resource.attributes.type.toUpperCase())

const geometryPath = (geometry: Geometry) => {
  const rings =
    geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  const positions = rings.flat()
  const longitudes = positions.map(position => position[0])
  const latitudes = positions.map(position => position[1])
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const width = 72
  const height = 42
  const padding = 4
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxLongitude - minLongitude, 0.000001),
    (height - padding * 2) / Math.max(maxLatitude - minLatitude, 0.000001),
  )
  const offsetX = (width - (maxLongitude - minLongitude) * scale) / 2
  const offsetY = (height - (maxLatitude - minLatitude) * scale) / 2

  return rings
    .map(
      ring =>
        `${ring
          .map(([longitude, latitude], index) => {
            const x = offsetX + (longitude - minLongitude) * scale
            const y = offsetY + (maxLatitude - latitude) * scale
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
          })
          .join(' ')} Z`,
    )
    .join(' ')
}
</script>

<div
  class="flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-mono text-sm shadow-inner"
>
  <div class="border-b border-[#596074] bg-[#202633] px-4 py-3 text-[#d6e4ff]">
    <div class="flex items-center justify-between gap-3">
      <span class="font-semibold tracking-[0.08em] uppercase">Divisions API</span>
      <span class="text-xs text-[#80e7c7]">200 OK</span>
    </div>
    <p class="mt-1 text-xs leading-5 text-white/55">GET /divisions/v0</p>
  </div>

  <div
    class="grid min-h-0 flex-1 divide-y divide-[#596074] sm:grid-cols-[minmax(13rem,1fr)_auto_minmax(0,2fr)] sm:divide-x sm:divide-y-0"
  >
    <section class="p-4">
      <p class="text-xs font-semibold tracking-[0.08em] text-[#a5d6ff] uppercase">
        {m.guide_data_urban_density_preview_request()}
      </p>
      <dl class="mt-3 space-y-2 text-xs leading-5 text-white/70">
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">filter[level]</dt>
          <dd>2</dd>
        </div>
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">include</dt>
          <dd class="break-all">hierarchy,areas:hkgov-censtatd-landclipped@2021</dd>
        </div>
        <div class="flex gap-3">
          <dt class="shrink-0 text-white/45">transform</dt>
          <dd>simplified</dd>
        </div>
      </dl>
    </section>

    <div
      class="flex items-center justify-center px-4 py-3 text-[#80e7c7]"
      aria-hidden="true"
    >
      →
    </div>

    <section class="flex min-h-0 flex-col overflow-auto p-4">
      <p class="text-xs font-semibold tracking-[0.08em] text-[#a5d6ff] uppercase">
        {m.guide_data_urban_density_preview_response()}
      </p>
      <p class="mt-3 text-xs leading-5 text-white/55">
        {m.guide_data_urban_density_divisions_preview_description()}
      </p>

      <section class="mt-5" aria-labelledby="divisions-response-data">
        <div class="flex items-baseline justify-between gap-3">
          <h3
            id="divisions-response-data"
            class="text-xs font-semibold tracking-[0.08em] text-[#80e7c7] uppercase"
          >
            {m.guide_data_urban_density_divisions_preview_data({ count: divisions.length })}
          </h3>
          <span class="text-[10px] text-white/45"
            >{m.guide_data_urban_density_preview_tap()}</span
          >
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 min-[500px]:grid-cols-6">
          {#each divisions as division}
            {@const code = division.attributes.divisionCode}
            <button
              type="button"
              class="border px-2 py-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-[#80e7c7] focus-visible:outline-none {selectedDivisionCode === code
                ? 'border-[#80e7c7] bg-[#80e7c7] text-[#10151a]'
                : 'border-white/15 bg-black/15 text-white/75 hover:border-[#80e7c7]/70 hover:text-[#80e7c7]'}"
              aria-label={`${division.attributes.i18n.en.name} (${code})`}
              aria-pressed={selectedDivisionCode === code}
              onclick={() => (selectedDivisionCode = code)}
            >
              <span class="block font-semibold tracking-[0.08em]">{code}</span>
              <span class="mt-1 block truncate text-[10px] opacity-65"
                >{areaName(division)}</span
              >
            </button>
          {/each}
        </div>

        {#if selectedDivision}
          <article
            class="mt-3 border border-[#80e7c7]/55 bg-[#17242a] p-3 text-xs leading-5 text-white/75"
            aria-live="polite"
          >
            <div
              class="flex items-start justify-between gap-3 border-b border-white/10 pb-2"
            >
              <div>
                <p class="font-semibold text-[#80e7c7]">
                  {selectedDivision.attributes.divisionCode}
                </p>
                <p class="mt-1 text-white/55">
                  {selectedDivision.attributes.i18n.en.name}
                </p>
              </div>
              <span class="text-[10px] tracking-[0.08em] text-white/45 uppercase"
                >attributes</span
              >
            </div>
            <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt class="text-white/40">level</dt>
              <dd>{selectedDivision.attributes.level}</dd>
              <dt class="text-white/40">type</dt>
              <dd>{selectedDivision.attributes.type}</dd>
              <dt class="text-white/40">divisionCode</dt>
              <dd>{selectedDivision.attributes.divisionCode}</dd>
              <dt class="text-white/40">i18n.en.name</dt>
              <dd>{selectedDivision.attributes.i18n.en.name}</dd>
              <dt class="text-white/40">parent division</dt>
              <dd>{areaName(selectedDivision)}</dd>
            </dl>
          </article>
        {/if}
      </section>

      <section
        class="mt-6 border-t border-white/10 pt-5"
        aria-labelledby="divisions-response-included"
      >
        <div class="flex items-baseline justify-between gap-3">
          <h3
            id="divisions-response-included"
            class="text-xs font-semibold tracking-[0.08em] text-[#80e7c7] uppercase"
          >
            {m.guide_data_urban_density_divisions_preview_included({ count: included.length })}
          </h3>
          <span class="text-[10px] text-white/45"
            >{m.guide_data_urban_density_preview_tap()}</span
          >
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 min-[500px]:grid-cols-4">
          {#each included as resource}
            <button
              type="button"
              class="border px-2 py-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-[#80e7c7] focus-visible:outline-none {selectedIncludedId === resource.id
                ? 'border-[#80e7c7] bg-[#80e7c7] text-[#10151a]'
                : 'border-white/15 bg-black/15 text-white/75 hover:border-[#80e7c7]/70 hover:text-[#80e7c7]'}"
              aria-label={`${isGeometryResource(resource) ? divisionName(resource.attributes.divisionCode) : resource.attributes.i18n.en.name} (${includedLabel(resource)})`}
              aria-pressed={selectedIncludedId === resource.id}
              onclick={() => (selectedIncludedId = resource.id)}
            >
              {#if isGeometryResource(resource)}
                <svg
                  class="mx-auto mb-2 h-10 w-full max-w-[4.5rem]"
                  viewBox="0 0 72 42"
                  role="img"
                  aria-label={`${divisionName(resource.attributes.divisionCode)} geometry`}
                >
                  <path
                    d={geometryPath(resource.attributes.geometry)}
                    fill="currentColor"
                    fill-opacity="0.32"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
              <span class="block font-semibold tracking-[0.08em]"
                >{includedLabel(resource)}</span
              >
              <span class="mt-1 block truncate text-[10px] opacity-65">
                {isGeometryResource(resource)
                  ? divisionName(resource.attributes.divisionCode)
                  : resource.attributes.i18n.en.name}
              </span>
            </button>
          {/each}
        </div>

        {#if selectedIncluded}
          <article
            class="mt-3 border border-[#80e7c7]/55 bg-[#17242a] p-3 text-xs leading-5 text-white/75"
            aria-live="polite"
          >
            <div
              class="flex items-start justify-between gap-3 border-b border-white/10 pb-2"
            >
              <div>
                <p class="font-semibold text-[#80e7c7]">
                  {includedLabel(selectedIncluded)}
                </p>
                <p class="mt-1 text-white/55">
                  {isGeometryResource(selectedIncluded)
                    ? divisionName(selectedIncluded.attributes.divisionCode)
                    : selectedIncluded.attributes.i18n.en.name}
                </p>
              </div>
              <span class="text-[10px] tracking-[0.08em] text-white/45 uppercase"
                >attributes</span
              >
            </div>
            <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {#if isGeometryResource(selectedIncluded)}
                <dt class="text-white/40">geometry</dt>
                <dd>{selectedIncluded.attributes.geometry.type}</dd>
                <dt class="text-white/40">divisionId</dt>
                <dd>{selectedIncluded.attributes.divisionId}</dd>
              {:else}
                <dt class="text-white/40">level</dt>
                <dd>{selectedIncluded.attributes.level}</dd>
                <dt class="text-white/40">type</dt>
                <dd>{selectedIncluded.attributes.type}</dd>
                {#if selectedIncluded.attributes.divisionCode}
                  <dt class="text-white/40">divisionCode</dt>
                  <dd>{selectedIncluded.attributes.divisionCode}</dd>
                {/if}
                <dt class="text-white/40">i18n.en.name</dt>
                <dd>{selectedIncluded.attributes.i18n.en.name}</dd>
              {/if}
            </dl>
            {#if isGeometryResource(selectedIncluded)}
              <svg
                class="mt-3 h-20 w-full"
                viewBox="0 0 72 42"
                role="img"
                aria-label={`${divisionName(selectedIncluded.attributes.divisionCode)} geometry`}
              >
                <path
                  d={geometryPath(selectedIncluded.attributes.geometry)}
                  fill="#80e7c7"
                  fill-opacity="0.32"
                  stroke="#80e7c7"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                />
              </svg>
            {/if}
          </article>
        {/if}
      </section>
    </section>
  </div>
</div>
