import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { getReleaseNotesPresentation } from '#lib/registry/releaseNotesPresentation.js'

import ReleaseNotesContent from './components/releaseNotesContent.svelte'

test('renders a markdown transclusion when its link is opened', async () => {
  const presentation = getReleaseNotesPresentation(
    '[normalised by locale](saanseoi:en:note/overture-division-locale-normalization/v1)',
    'en',
  )
  const screen = await render(ReleaseNotesContent, presentation)

  await screen.getByRole('button', { name: 'Show Locale normalisation' }).click()

  await expect
    .element(
      screen.getByText('Locale tags are normalised to lowercase BCP 47-like forms'),
    )
    .toBeVisible()
})

test('renders a short glossary definition when its link is opened', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation('[release](saanseoi:en:definition/release/v1)', 'en'),
  )

  await screen.getByRole('button', { name: 'Show Release' }).click()

  await expect
    .element(
      screen.getByText(
        'A release is an immutable published version of data and its metadata.',
      ),
    )
    .toBeVisible()
})

test('colours URL families on every line of a fenced URL block', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      `\`\`\`url
/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021
/v0.2/addresses?domain=hkgov-pland-new-town&cohort=2021
\`\`\``,
      'en',
    ),
  )

  await expect.element(screen.getByText('/divisions')).toHaveClass('text-orange-200')
  await expect.element(screen.getByText('/addresses')).toHaveClass('text-orange-200')
  await expect
    .element(screen.getByText('hkgov-pland-new-town'))
    .toHaveClass('text-blue-300')
})

test('opens external documentation safely in a new tab', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation('[SaanSeoi](https://saanseoi.org)', 'en'),
  )

  await expect
    .element(screen.getByRole('link', { name: /SaanSeoi/ }))
    .toHaveAttribute('target', '_blank')
  await expect
    .element(screen.getByRole('link', { name: /SaanSeoi/ }))
    .toHaveAttribute('rel', 'noopener noreferrer')
})
