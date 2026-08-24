import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { getReleaseNotesPresentation } from '#lib/registry/releaseNotesPresentation.js'

import ReleaseDiffRoot from './components/releaseDiffRoot.svelte'

vi.hoisted(() => {
  Object.assign(globalThis, {
    __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
  })
})

const labels = { added: 'Added', removed: 'Removed', empty: 'No changes' }
const markdown = getReleaseNotesPresentation('', 'en')

test('labels populated panes on small screens as well as in the legend', async () => {
  const screen = await render(ReleaseDiffRoot, {
    changes: [{ addedMarkdown: 'Added text', removedMarkdown: 'Removed text' }],
    labels,
    markdown,
  })

  await expect.element(screen.getByText('Removed', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Added', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Removed text')).toBeVisible()
  await expect.element(screen.getByText('Added text')).toBeVisible()
})

test('renders the supplied no-change state', async () => {
  const screen = await render(ReleaseDiffRoot, { changes: [], labels, markdown })

  await expect.element(screen.getByText('No changes')).toBeVisible()
})

test('centres an initial-release empty state in the notes pane', async () => {
  const screen = await render(ReleaseDiffRoot, {
    centerEmptyState: true,
    changes: [],
    labels: { ...labels, empty: 'Initial release. Nothing to compare to.' },
    markdown,
  })

  await expect
    .element(screen.getByText('Initial release. Nothing to compare to.'))
    .toHaveClass('items-center')
  await expect
    .element(screen.getByText('Initial release. Nothing to compare to.'))
    .toHaveClass('justify-center')
})
