<script lang="ts">
import Icon from '@iconify/svelte'
import type {
  GeometryStatisticsPresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'

let {
  geometry,
  labels,
}: { geometry: GeometryStatisticsPresentation; labels: ReleaseStatsLabels } = $props()

type SortColumn =
  | 'area'
  | 'boundaryLength'
  | 'boundarySegmentCount'
  | 'district'
  | 'featureCount'
  | 'polygonCount'

let sortColumn = $state<SortColumn>('district')
let sortDirection = $state<'ascending' | 'descending'>('ascending')

const sortRows = (column: SortColumn) => {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'ascending' ? 'descending' : 'ascending'
    return
  }

  sortColumn = column
  sortDirection = 'ascending'
}

const sortedRows = $derived(
  [...geometry.rows].sort((left, right) => {
    if (sortColumn === 'district') {
      const difference = left.label.localeCompare(right.label)
      return sortDirection === 'ascending' ? difference : -difference
    }

    const leftValue = Number(left[sortColumn]?.replaceAll(',', ''))
    const rightValue = Number(right[sortColumn]?.replaceAll(',', ''))
    if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
      if (Number.isNaN(leftValue) === Number.isNaN(rightValue)) return 0
      return Number.isNaN(leftValue) ? 1 : -1
    }

    const difference = leftValue - rightValue

    return sortDirection === 'ascending' ? difference : -difference
  }),
)
</script>

<Section>
  <Header eyebrow={labels.geometry} id={geometry.id} title={labels.geometryByDistrict}>
    <InfoTooltip
      label={labels.geometryInfo}
      description={labels.geometryInfoDescription}
    />
  </Header>
  <div class="overflow-x-auto">
    <table
      class={geometry.showFeatureCount
        ? 'w-full min-w-190 border-collapse font-body text-label-md'
        : 'w-full min-w-160 border-collapse font-body text-label-md'}
    >
      <thead
        class="bg-data-surface-container-low text-left text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        <tr>
          <th
            class="px-5 py-3"
            aria-sort={sortColumn === 'district' ? sortDirection : 'none'}
            scope="col"
          >
            <button
              class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
              onclick={() => sortRows('district')}
              type="button"
            >
              {labels.district}
              <Icon
                aria-hidden="true"
                class="size-3"
                icon={sortColumn === 'district' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
              />
            </button>
          </th>
          {#if geometry.showFeatureCount}
            <th
              class="px-5 py-3 text-right"
              aria-sort={sortColumn === 'featureCount' ? sortDirection : 'none'}
              scope="col"
            >
              <button
                class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
                onclick={() => sortRows('featureCount')}
                type="button"
              >
                {labels.geometryFeatures}
                <Icon
                  aria-hidden="true"
                  class="size-3"
                  icon={sortColumn === 'featureCount' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
                />
              </button>
            </th>
          {/if}
          <th
            class="px-5 py-3 text-right"
            aria-sort={sortColumn === 'polygonCount' ? sortDirection : 'none'}
            scope="col"
          >
            <button
              class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
              onclick={() => sortRows('polygonCount')}
              type="button"
            >
              {labels.geometryPolygons}
              <Icon
                aria-hidden="true"
                class="size-3"
                icon={sortColumn === 'polygonCount' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
              />
            </button>
          </th>
          <th
            class="px-5 py-3 text-right"
            aria-sort={sortColumn === 'boundarySegmentCount' ? sortDirection : 'none'}
            scope="col"
          >
            <button
              class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
              onclick={() => sortRows('boundarySegmentCount')}
              type="button"
            >
              {labels.geometryBoundarySegments}
              <Icon
                aria-hidden="true"
                class="size-3"
                icon={sortColumn === 'boundarySegmentCount' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
              />
            </button>
          </th>
          <th
            class="px-5 py-3 text-right"
            aria-sort={sortColumn === 'area' ? sortDirection : 'none'}
            scope="col"
          >
            <button
              class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
              onclick={() => sortRows('area')}
              type="button"
            >
              {labels.geometryArea}
              (km²)
              <Icon
                aria-hidden="true"
                class="size-3"
                icon={sortColumn === 'area' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
              />
            </button>
          </th>
          <th
            class="px-5 py-3 text-right"
            aria-sort={sortColumn === 'boundaryLength' ? sortDirection : 'none'}
            scope="col"
          >
            <button
              class="inline-flex cursor-pointer items-center gap-1.5 hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
              onclick={() => sortRows('boundaryLength')}
              type="button"
            >
              {labels.geometryBoundaryLength}
              (km)
              <Icon
                aria-hidden="true"
                class="size-3"
                icon={sortColumn === 'boundaryLength' ? (sortDirection === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down') : 'proicons:arrow-sort'}
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody
        class="divide-y divide-data-outline-variant/60 bg-data-surface-container-lowest"
      >
        {#each sortedRows as row (row.districtId)}
          <tr>
            <th class="px-5 py-3 text-left font-semibold text-primary" scope="row">
              {row.label}
              {#if row.unofficial}
                <span
                  class="ml-2 inline-flex rounded-sm border border-red-600/60 bg-red-100 px-1.5 py-0.5 text-caption font-semibold uppercase tracking-[0.08em] text-red-800 dark:border-red-400/60 dark:bg-red-950/60 dark:text-red-200"
                >
                  {labels.geometryUnofficial}
                </span>
              {/if}
            </th>
            {#if geometry.showFeatureCount}
              <td class="px-5 py-3 text-right font-mono tabular-nums text-primary">
                {row.featureCount}
              </td>
            {/if}
            <td class="px-5 py-3 text-right font-mono tabular-nums text-primary">
              {row.polygonCount ?? labels.notApplicable}
            </td>
            <td class="px-5 py-3 text-right font-mono tabular-nums text-primary">
              {row.boundarySegmentCount}
            </td>
            <td class="px-5 py-3 text-right font-mono tabular-nums text-primary">
              {row.area ?? labels.notApplicable}
            </td>
            <td class="px-5 py-3 text-right font-mono tabular-nums text-primary">
              {row.boundaryLength}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Section>
