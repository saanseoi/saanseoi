import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { revealReleaseNavVersion } from '../releaseNavScroll'
import ReleaseNavVersionList from './releaseNavVersionList.svelte'

test('keeps the API heading pinned when revealing a release deep in the list', async () => {
  const versions = Array.from({ length: 30 }, (_, index) => ({
    code: `release-${index}`,
    label: `Release ${index}`,
    href: `/apis/divisions/release-${index}`,
    apiVersion: 'v0.1',
  }))
  const screen = await render(ReleaseNavVersionList, {
    currentVersionCode: 'release-25',
    versions,
  })
  const list = screen.container.querySelector<HTMLElement>(
    '[data-release-nav-version-list]',
  )!
  list.style.height = '180px'
  const heading = list.querySelector<HTMLElement>('[data-release-nav-api-heading]')!
  const active =
    list.querySelector<HTMLElement>('button')!.parentElement!.parentElement!

  await revealReleaseNavVersion(active, list)

  await expect.poll(() => list.scrollTop).toBeGreaterThan(500)
  await expect
    .poll(() =>
      Math.abs(heading.getBoundingClientRect().top - list.getBoundingClientRect().top),
    )
    .toBeLessThan(1)
  await expect
    .poll(() =>
      Math.abs(
        active.getBoundingClientRect().top - heading.getBoundingClientRect().bottom - 8,
      ),
    )
    .toBeLessThan(1)
})
