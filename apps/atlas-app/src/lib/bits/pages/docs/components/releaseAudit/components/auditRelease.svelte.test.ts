import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import type { AuditManifest } from '@repo/core/provenance'
import AuditRelease from './auditRelease.svelte'

vi.mock('#lib/registry/audit.remote.js', () => ({
  getAuditFixtureCatalogue: vi.fn(async () => ({ groups: {}, als: [] })),
  getAuditPage: vi.fn(async () => ({
    rows: [],
    total: 0,
    bulkIds: [],
    nextOffset: null,
  })),
  getAuditDecision: vi.fn(),
  getAuditFixtureGroup: vi.fn(),
  getAuditAlsDecisions: vi.fn(),
  getRetainedRuleDeclaration: vi.fn(),
  getRetainedBulkFixture: vi.fn(),
}))

test('guard-only matches contribute to source audit search counts', async () => {
  const onSearchStateChange = vi.fn()
  const manifest = {
    resourceReleaseId: 'source-release',
    applicationCount: 0,
    bulk: [],
    individualFixtures: [],
    guards: [
      {
        id: 'overture-source-payload-contract',
        summary: 'Require valid attribution.',
        reason: 'Checked payloads.',
        consequence: 'block-ingestion',
        status: 'passed',
        checked: 142,
        failed: 0,
      },
    ],
  } as unknown as AuditManifest
  const screen = await render(AuditRelease, {
    manifest,
    hash: 'audit-hash',
    releaseCode: 'release',
    resourceType: 'divisionArea',
    showControls: false,
    query: 'attribution',
    onSearchStateChange,
  })
  await expect
    .poll(() => onSearchStateChange.mock.calls.at(-1)?.[0])
    .toEqual({
      failed: false,
      loading: false,
      filteredCount: 1,
      totalCount: 1,
    })
  await expect
    .element(
      screen.getByText(
        'Require valid publisher attribution and collision-free saved property names.',
      ),
    )
    .toBeVisible()
  await screen.rerender({ query: 'no-matching-guard' })
  await expect
    .poll(() => onSearchStateChange.mock.calls.at(-1)?.[0])
    .toEqual({
      failed: false,
      loading: false,
      filteredCount: 0,
      totalCount: 1,
    })
})
