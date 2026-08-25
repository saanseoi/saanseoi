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
    stats: [{ dimension: 'records', metric: 'count', value: 18 }],
  })
  await expect.element(screen.getByRole('heading', { name: 'Measures' })).toBeVisible()
  await expect.element(screen.getByRole('table')).toBeVisible()
  await expect.element(screen.getByText('Definition not yet reviewed')).toBeVisible()
  await expect.element(screen.getByText('Not mapped')).toBeVisible()
})

test('exposes the churn explanation through an accessible tooltip trigger', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    stats: [
      { dimension: 'count', metric: 'churn', value: 1 },
      { dimension: 'added_count', metric: 'churn', value: 1 },
    ],
  })
  await expect
    .element(screen.getByRole('button', { name: 'Change summary' }))
    .toBeVisible()
})

test('renders all four exclusive name-provenance categories', async () => {
  const screen = await render(ReleaseStatsRootTestHarness, {
    stats: [
      {
        dimension: 'locale_count',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 4,
      },
      {
        dimension: 'locale_coverage',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 100,
      },
      {
        dimension: 'locale_coverage_provided',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 25,
      },
      {
        dimension: 'locale_coverage_inferred',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 25,
      },
      {
        dimension: 'locale_coverage_ai_translated',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 25,
      },
      {
        dimension: 'locale_coverage_human_translated',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
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
        dimension: 'geometry',
        metric: 'feature_count',
        value: 1,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_segment_count',
        value: 4,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_length',
        value: 1.2,
        groupBy: 'district',
        groupValue: 'district-a',
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
        dimension: 'geometry',
        metric: 'feature_count',
        value: 1,
        groupBy: 'district',
        groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_segment_count',
        value: 4,
        groupBy: 'district',
        groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_length',
        value: 1.2,
        groupBy: 'district',
        groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
      },
    ],
  })

  await expect
    .element(screen.getByRole('rowheader', { name: 'Lok Ma Chau Loop Unofficial' }))
    .toBeVisible()
  await expect.element(screen.getByText('Unofficial')).toBeVisible()
})
