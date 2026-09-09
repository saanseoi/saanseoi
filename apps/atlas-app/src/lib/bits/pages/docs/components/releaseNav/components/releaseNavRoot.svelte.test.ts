import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReleaseNavRoot from './releaseNavRoot.svelte'

const outline = [{ id: 'final-section', depth: 2, label: 'Final section' }]

test('keeps the current outline section selected while its document is loading', async () => {
  const screen = await render(ReleaseNavRoot, {
    activeOutlineId: 'final-section',
    analyticsSurface: 'api_release',
    currentVersionCode: 'v1',
    hasContent: true,
    loading: true,
    outline,
    tabs: [],
    versionTitle: 'Versions',
    versions: [{ code: 'v1', href: '/apis/example/v1', label: 'v1' }],
  })

  for (const link of screen.container.querySelectorAll('a[href="#final-section"]')) {
    expect(link).toHaveAttribute('aria-current', 'location')
  }
})

test('marks the supplied active outline section current once its document has loaded', async () => {
  const screen = await render(ReleaseNavRoot, {
    activeOutlineId: 'final-section',
    analyticsSurface: 'api_release',
    currentVersionCode: 'v1',
    hasContent: true,
    outline,
    tabs: [],
    versionTitle: 'Versions',
    versions: [{ code: 'v1', href: '/apis/example/v1', label: 'v1' }],
  })

  for (const link of screen.container.querySelectorAll('a[href="#final-section"]')) {
    expect(link).toHaveAttribute('aria-current', 'location')
  }
})
