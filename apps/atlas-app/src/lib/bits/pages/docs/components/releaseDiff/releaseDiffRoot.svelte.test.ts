import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { getReleaseNotesPresentation } from '$lib/registry/releaseNotesPresentation'

import ReleaseDiffRoot from './components/releaseDiffRoot.svelte'

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
