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
    releaseId: 'release',
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
    releaseId: 'release',
    hash: 'hash',
    bulkId: 'bulk',
    type: 'entries',
    q: '',
  })
})
