import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { getReleaseNotesPresentation } from '#lib/registry/releaseNotesPresentation.js'

import ReleaseNotesContent from './components/releaseNotesContent.svelte'

vi.hoisted(() => {
  Object.assign(globalThis, {
    __sveltekit_dev: { env: { PUBLIC_ATLAS_API_BASE_URL: 'http://localhost:8787' } },
  })
})

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

test('labels fenced API URL snippets as GET requests', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      `\`\`\`url
/v0.1/divisions?domain=geographic&cohort=2025-09-24.0
\`\`\``,
      'en',
    ),
  )

  await expect.element(screen.getByText('GET', { exact: true })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
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

test('centres generated source-table group headings', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation('### Supporting · Division Boundary', 'en'),
  )

  await expect
    .element(screen.getByRole('heading', { name: 'Supporting · Division Boundary' }))
    .toHaveClass('text-center')
  await expect
    .element(screen.getByRole('heading', { name: 'Supporting · Division Boundary' }))
    .toHaveClass('bg-surface-container-high')
  await expect
    .element(screen.getByRole('heading', { name: 'Supporting · Division Boundary' }))
    .toHaveClass('uppercase')
})

test('escapes arbitrary HTML while preserving supported release-note tags', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      '<iframe src="https://example.com">unsafe</iframe> <black>safe</black>',
      'en',
    ),
  )

  await expect.element(screen.getByText('safe')).toHaveClass('font-mono')
  await expect.element(screen.getByText(/<iframe/)).toBeVisible()
  expect(document.querySelector('iframe')).toBeNull()
})

test('renders allowed presentational HTML in transcluded definitions', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      'A <i>domain</i> is separate.<br>Always select it.',
      'en',
    ),
  )

  await expect.element(screen.getByText('domain')).toHaveProperty('tagName', 'I')
  expect(screen.container.querySelector('br')).not.toBeNull()
})

test('renders release-note callouts and tooltip definitions', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      '<note title="API key required">Use a key.</note> <tooltip description="A cohort identifies source data from the same reference release or period.">cohort</tooltip>',
      'en',
    ),
  )

  await expect.element(screen.getByText('API key required')).toBeVisible()
  await expect.element(screen.getByText('Use a key.')).toBeVisible()
  await expect
    .element(
      screen.getByRole('button', {
        name: 'A cohort identifies source data from the same reference release or period.',
      }),
    )
    .toBeVisible()
})
