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
