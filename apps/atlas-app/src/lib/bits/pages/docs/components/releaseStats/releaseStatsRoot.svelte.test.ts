import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseStatsRootTestHarness from './releaseStatsRootTestHarness.svelte'

test('renders the supplied empty state', async () => {
  const screen = await render(ReleaseStatsRootTestHarness)
  await expect.element(screen.getByText('No stats')).toBeVisible()
})

test('renders a measure data dictionary with pending metadata visibly marked', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    measures: [
      {
        definition: null,
        aggregation: 'total',
        name: 'Population',
        observationCount: 18,
        sourceField: 'POPULATION',
        statisticKind: 'count',
        unitCode: 'publisher-unknown',
        valueKind: 'numeric',
      },
    ],
    stats: [{ category: 'records', measure: 'count', value: 18 }],
  })
  await expect.element(screen.getByRole('heading', { name: 'Measures' })).toBeVisible()
  await expect.element(screen.getByRole('table')).toBeVisible()
  await expect.element(screen.getByText('Definition not yet reviewed')).toBeVisible()
  await expect.element(screen.getByText('Not mapped')).toBeVisible()
})

test('exposes the churn explanation through an accessible tooltip trigger', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    stats: [
      { category: 'changes', measure: 'count', value: 1 },
      { category: 'changes', measure: 'added_count', value: 1 },
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: 'Change Summary' }))
    .toBeVisible()
})

test('renders all four exclusive name-provenance categories', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    stats: [
      {
        category: 'completeness',
        measure: 'locale_count',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 4,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 100,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_provided',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 25,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_inferred',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 25,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_ai_translated',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 25,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_human_translated',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 25,
      },
    ],
  })
  await expect.element(screen.getByRole('img', { name: 'Locale legend' })).toBeVisible()
  for (const label of ['Provided', 'Inferred', 'AI translated', 'Human translated']) {
    await expect.element(screen.getByText(label)).toBeVisible()
  }
})

test('renders geometry in an accessible district table', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    districtAreas: [
      {
        divisionId: 'district-a',
        name: 'Alpha District',
        geometry: { type: 'Polygon', coordinates: [] },
      },
    ],
    stats: [
      {
        category: 'geometry',
        measure: 'feature_count',
        value: 1,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_segment_count',
        value: 4,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_length',
        value: 1.2,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
    ],
  })
  await expect
    .element(screen.getByRole('heading', { name: 'By District' }))
    .toBeVisible()
  await expect.element(screen.getByRole('table')).toBeVisible()
  expect(screen.getByRole('columnheader', { name: 'Features' }).query()).toBeNull()
  await expect
    .element(screen.getByRole('columnheader', { name: 'Boundary segments' }))
    .toBeVisible()
  expect(screen.getByRole('columnheader', { name: 'Polygons' }).query()).toBeNull()
  expect(screen.getByRole('columnheader', { name: 'Area (km²)' }).query()).toBeNull()
  await expect
    .element(screen.getByRole('button', { name: 'About geometry measurements' }))
    .toBeVisible()
})

test('labels the Lok Ma Chau Loop as an unofficial district', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    districtNames: [
      {
        divisionId: '222b7818-970a-491d-98b6-b88d8c6f0161',
        name: 'Lok Ma Chau Loop',
        unofficial: true,
      },
    ],
    stats: [
      {
        category: 'geometry',
        measure: 'feature_count',
        value: 1,
        dimension: 'district',
        dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
      {
        category: 'geometry',
        measure: 'boundary_segment_count',
        value: 4,
        dimension: 'district',
        dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
      {
        category: 'geometry',
        measure: 'boundary_length',
        value: 1.2,
        dimension: 'district',
        dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
    ],
  })

  await expect
    .element(screen.getByRole('rowheader', { name: 'Lok Ma Chau Loop Unofficial' }))
    .toBeVisible()
  await expect.element(screen.getByText('Unofficial')).toBeVisible()
})

test('Places shows category bars and optional-field coverage with counts and missing values', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    resourceType: 'place',
    stats: [
      { category: 'records', measure: 'count', value: 10 },
      {
        category: 'records',
        measure: 'count',
        value: 6,
        dimension: 'basicCategory',
        dimensionValue: 'food_service',
      },
      {
        category: 'records',
        measure: 'count',
        value: 4,
        dimension: 'basicCategory',
        dimensionValue: 'unspecified',
      },
      {
        category: 'completeness',
        measure: 'count',
        value: 6,
        dimension: 'placeField',
        dimensionValue: 'website',
      },
      {
        category: 'completeness',
        measure: 'missing_count',
        value: 4,
        dimension: 'placeField',
        dimensionValue: 'website',
      },
      {
        category: 'completeness',
        measure: 'coverage',
        unit: 'percentage',
        value: 60,
        dimension: 'placeField',
        dimensionValue: 'website',
      },
    ],
  })
  await expect
    .element(screen.getByRole('heading', { name: 'Field coverage' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('img', { name: 'Website: 6 places, 60%; 4 missing' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('heading', { name: 'basicCategory' }))
    .toBeVisible()
  await expect.element(screen.getByText('food_service', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByRole('heading', { name: 'placeField' }))
    .not.toBeInTheDocument()
})

test('long Place category distributions keep remaining categories expandable', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    resourceType: 'place',
    stats: [
      { category: 'records', measure: 'count', value: 105 },
      ...Array.from({ length: 14 }, (_, index) => ({
        category: 'records',
        measure: 'count',
        value: 14 - index,
        dimension: 'basicCategory',
        dimensionValue: `category${index}`,
      })),
    ],
  })
  await expect
    .element(screen.getByText('category13', { exact: true }))
    .not.toBeVisible()
  await screen.getByText('Show 2 more', { exact: true }).click()
  await expect.element(screen.getByText('category13', { exact: true })).toBeVisible()
})
