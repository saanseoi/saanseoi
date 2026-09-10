import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { getAuditPage } from '#lib/registry/audit.remote.js'
import Applications from './auditApplications.svelte'

vi.mock('#lib/registry/audit.remote.js', () => ({
  getAuditPage: vi.fn(async () => ({
    rows: [],
    total: 0,
    bulkIds: [],
    nextOffset: null,
  })),
  getAuditDecision: vi.fn(),
  getRetainedRuleDeclaration: vi.fn(),
  getRetainedBulkFixture: vi.fn(),
}))

test('a complete empty category stays resolved while searching without more requests', async () => {
  vi.mocked(getAuditPage).mockClear()
  const screen = await render(Applications, {
    releaseId: 'release',
    hash: 'hash',
    category: 'patches',
  })
  await expect.poll(() => vi.mocked(getAuditPage).mock.calls.length).toBe(1)
  await expect
    .poll(() =>
      screen.container.querySelector('[aria-busy]')?.getAttribute('aria-busy'),
    )
    .toBe('false')
  await screen.rerender({ query: 'mmog' })
  await expect
    .poll(() =>
      screen.container.querySelector('[aria-busy]')?.getAttribute('aria-busy'),
    )
    .toBe('false')
  expect(getAuditPage).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').elements()).toHaveLength(0)
  await screen.rerender({ query: '' })
  expect(getAuditPage).toHaveBeenCalledTimes(1)
})
