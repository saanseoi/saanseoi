import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseStatsRootTestHarness from './releaseStatsRootTestHarness.svelte'

test('renders the supplied empty state', async () => {
  const screen = await render(ReleaseStatsRootTestHarness)
  await expect.element(screen.getByText('No stats')).toBeVisible()
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
  await expect
    .element(screen.getByRole('columnheader', { name: 'Features' }))
    .not.toBeVisible()
  await expect
    .element(screen.getByRole('columnheader', { name: 'Boundary segments' }))
    .toBeVisible()
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
