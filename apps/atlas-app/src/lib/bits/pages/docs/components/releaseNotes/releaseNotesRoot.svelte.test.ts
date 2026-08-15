import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { getReleaseNotesPresentation } from '#lib/registry/releaseNotesPresentation.js'

import ReleaseNotesRootTestHarness from './releaseNotesRootTestHarness.svelte'

test('tracks a rendered heading using the shared outline IDs', async () => {
  const screen = await render(ReleaseNotesRootTestHarness, {
    presentation: getReleaseNotesPresentation('## First\n\n## Second', 'en'),
  })

  await expect
    .element(screen.getByRole('heading', { name: 'Second' }))
    .toHaveAttribute('id', 'source-heading-second')
  await expect
    .element(screen.getByTestId('active-heading'))
    .toHaveTextContent('source-heading-second')
})
