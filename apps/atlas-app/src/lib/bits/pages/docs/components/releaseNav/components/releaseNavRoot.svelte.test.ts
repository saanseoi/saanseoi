import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { tick } from 'svelte'

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

test('keeps a clicked section current until the user scrolls manually', async () => {
  const screen = await render(ReleaseNavRoot, {
    activeOutlineId: 'first-section',
    analyticsSurface: 'api_release',
    currentVersionCode: 'v1',
    hasContent: true,
    outline: [
      { id: 'first-section', depth: 2, label: 'First section' },
      { id: 'second-section', depth: 2, label: 'Second section' },
    ],
    tabs: [],
    versionTitle: 'Versions',
    versions: [{ code: 'v1', href: '/apis/example/v1', label: 'v1' }],
  })
  const secondLink = screen.container.querySelector<HTMLAnchorElement>(
    'a[href="#second-section"]',
  )
  secondLink?.addEventListener('click', event => event.preventDefault(), {
    capture: true,
  })
  secondLink?.click()
  await tick()

  expect(screen.container.querySelector('a[href="#second-section"]')).toHaveAttribute(
    'aria-current',
    'location',
  )
  expect(
    screen.container.querySelector('a[href="#first-section"]'),
  ).not.toHaveAttribute('aria-current')

  window.dispatchEvent(new WheelEvent('wheel'))
  await tick()

  expect(screen.container.querySelector('a[href="#first-section"]')).toHaveAttribute(
    'aria-current',
    'location',
  )
  expect(
    screen.container.querySelector('a[href="#second-section"]'),
  ).not.toHaveAttribute('aria-current')
})

test('continues the active stem towards the next sibling in the inactive colour', async () => {
  const screen = await render(ReleaseNavRoot, {
    activeOutlineId: 'active-child',
    analyticsSurface: 'api_release',
    currentVersionCode: 'v1',
    hasContent: true,
    outline: [
      { id: 'parent', depth: 2, label: 'Parent' },
      { id: 'active-child', depth: 3, label: 'Active child' },
      { id: 'next-child', depth: 3, label: 'Next child' },
    ],
    tabs: [],
    versionTitle: 'Versions',
    versions: [{ code: 'v1', href: '/apis/example/v1', label: 'v1' }],
  })

  const activeLink = screen.container.querySelector('a[href="#active-child"]')
  const activeItem = activeLink?.closest('li')
  expect(activeItem?.querySelector('[data-release-nav-stem="active-end"]')).toHaveClass(
    'bg-secondary',
  )
  expect(activeItem?.querySelector('[data-release-nav-stem-continuation]')).toHaveClass(
    'bg-outline-variant/80',
    '-bottom-1',
  )
})
