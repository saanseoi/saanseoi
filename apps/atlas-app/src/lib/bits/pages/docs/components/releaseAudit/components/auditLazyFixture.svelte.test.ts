import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { getAuditFixtureGroup } from '#lib/registry/audit.remote.js'
import LazyFixture from './auditLazyFixture.svelte'

vi.mock('#lib/registry/audit.remote.js', () => ({
  getAuditFixtureGroup: vi.fn(async () => ({ entries: [{ name: 'Lazy evidence' }] })),
  getAuditPage: vi.fn(),
  getAuditDecision: vi.fn(),
  getRetainedBulkFixture: vi.fn(),
  getRetainedRuleDeclaration: vi.fn(),
}))

test('closed fixture groups use search metadata without requesting evidence', async () => {
  vi.mocked(getAuditFixtureGroup).mockClear()
  const screen = await render(LazyFixture, {
    resourceReleaseId: 'release',
    hash: 'hash',
    bulkId: 'bulk',
    type: 'entries',
    query: '',
    label: 'Retained evidence',
    group: { rows: ['lazy evidence'], text: null },
  })
  await expect
    .element(screen.getByText('Retained evidence', { exact: false }))
    .toBeVisible()
  expect(getAuditFixtureGroup).not.toHaveBeenCalled()
  await screen.getByText('Retained evidence', { exact: false }).click()
  await expect.element(screen.getByText('Lazy evidence', { exact: true })).toBeVisible()
  expect(getAuditFixtureGroup).toHaveBeenCalledExactlyOnceWith({
    resourceReleaseId: 'release',
    hash: 'hash',
    bulkId: 'bulk',
    type: 'entries',
    q: '',
  })
  await screen.rerender({ query: 'absent' })
  await expect
    .poll(() => screen.getByText('Lazy evidence', { exact: true }).elements())
    .toHaveLength(0)
  await screen.rerender({ query: 'lazy' })
  await expect.element(screen.getByText('Lazy evidence', { exact: true })).toBeVisible()
  expect(getAuditFixtureGroup).toHaveBeenCalledTimes(1)
})

test('large fixtures fetch bounded pages and reset pagination for a search', async () => {
  const load = vi.mocked(getAuditFixtureGroup)
  load.mockClear()
  load.mockResolvedValue({ entries: [{ name: 'Paged evidence' }] })
  const screen = await render(LazyFixture, {
    resourceReleaseId: 'release',
    hash: 'hash',
    bulkId: 'bulk',
    type: 'entries',
    query: '',
    label: 'Partitioned evidence',
    group: { rows: [], text: null, totalRows: 120, matchingRows: 120 },
  })
  expect(load).not.toHaveBeenCalled()
  await screen.getByText('Partitioned evidence', { exact: false }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Next', exact: true }))
    .toBeVisible()
  expect(load).toHaveBeenLastCalledWith({
    resourceReleaseId: 'release',
    hash: 'hash',
    bulkId: 'bulk',
    type: 'entries',
    q: '',
    offset: 0,
  })
  await screen.getByRole('button', { name: 'Next', exact: true }).click()
  await expect.poll(() => load.mock.calls.at(-1)?.[0].offset).toBe(50)
  await screen.rerender({
    query: 'needle',
    group: { rows: [], text: null, totalRows: 120, matchingRows: 1 },
  })
  await expect
    .poll(() => load.mock.calls.at(-1)?.[0])
    .toEqual({
      resourceReleaseId: 'release',
      hash: 'hash',
      bulkId: 'bulk',
      type: 'entries',
      q: 'needle',
      offset: 0,
    })
  await expect
    .element(screen.getByRole('button', { name: 'Next', exact: true }))
    .toBeDisabled()
})
