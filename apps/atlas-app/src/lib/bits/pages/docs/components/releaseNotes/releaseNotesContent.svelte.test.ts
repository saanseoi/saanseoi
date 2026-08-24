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
/divisions/v0?domain=hkgov-pland-pu&cohort=2021
/addresses/v0.2?domain=hkgov-pland-new-town&cohort=2021
\`\`\``,
      'en',
    ),
  )

  await expect.element(screen.getByText('/divisions')).toHaveClass('text-orange-200')
  await expect.element(screen.getByText('/addresses')).toHaveClass('text-orange-200')
  await expect
    .element(screen.getByText('hkgov-pland-new-town'))
    .toHaveClass('text-data-warning')
})

test('labels fenced API URL snippets as GET requests', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      `\`\`\`url
/divisions/v0?domain=geographic&cohort=2025-09-24.0
\`\`\``,
      'en',
    ),
  )

  await expect.element(screen.getByText('GET', { exact: true })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
})

test('keeps API versions visible on the URL block primary surface', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      `\`\`\`url
/divisions/v0.1?domain=geographic&cohort=2025-09-24.0
\`\`\``,
      'en',
    ),
  )

  await expect.element(screen.getByText('/v0.1')).toHaveClass('text-primary-fixed')
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

test('preserves a publisher link title as its full name', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      '[C&SD](/publishers/hkgov-censtatd "Census and Statistics Department")',
      'en',
    ),
  )

  await expect
    .element(screen.getByRole('link', { name: 'C&SD' }))
    .toHaveAttribute('href', '/publishers/hkgov-censtatd')
  await expect
    .element(screen.getByRole('link', { name: 'C&SD' }))
    .toHaveAttribute('title', 'Census and Statistics Department')
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

test('renders release-note callouts', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      '<note title="API key required">Use [a key](/guides/api-keys).</note>',
      'en',
    ),
  )

  await expect.element(screen.getByText('API key required')).toBeVisible()
  await expect.element(screen.getByText('Use')).toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: 'a key' }))
    .toHaveAttribute('href', '/guides/api-keys')
})

test('renders an optional note action', async () => {
  const screen = await render(
    ReleaseNotesContent,
    getReleaseNotesPresentation(
      '<note title="API key required" action-href="/guides/api-keys" action-label="Get API key">Provide your key.</note>',
      'en',
    ),
  )

  await expect
    .element(screen.getByRole('link', { name: 'Get API key' }))
    .toHaveAttribute('href', '/guides/api-keys')
  await expect
    .element(screen.getByRole('link', { name: 'Get API key' }))
    .toHaveClass('no-underline')
})
