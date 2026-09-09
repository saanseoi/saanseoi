import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Fixture from './auditFixture.svelte'

test('large variable-height fixtures recycle rows and reach the final entry', async () => {
  const entries = Array.from({ length: 2_000 }, (_, index) => ({
    name: `fixture-row-${index}`,
    notes: 'Variable height evidence. '.repeat((index % 7) + 1),
  }))
  const screen = await render(Fixture, { value: { entries } })
  await expect.element(screen.getByText('fixture-row-0', { exact: true })).toBeVisible()
  const viewport = document.querySelector<HTMLElement>('[data-audit-virtual-list]')!
  expect(viewport.querySelectorAll(':scope > ul > li').length).toBeLessThan(30)
  viewport.scrollTop = viewport.scrollHeight
  await expect
    .element(screen.getByText('fixture-row-1999', { exact: true }))
    .toBeVisible()
  expect(viewport.querySelectorAll(':scope > ul > li').length).toBeLessThan(30)
  expect(screen.getByText('fixture-row-0', { exact: true }).elements()).toHaveLength(0)
  viewport.scrollTop = 0
  await expect.element(screen.getByText('fixture-row-0', { exact: true })).toBeVisible()
})
