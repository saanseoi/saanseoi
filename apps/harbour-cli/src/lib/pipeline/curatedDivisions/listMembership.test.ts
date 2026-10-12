import { expect, test } from 'bun:test'
import { applyRvdMembership } from './listMembership'
import matches from '../../../../../../fixtures/meta/curations/saanseoi-division/division-identity-matches.json'
const crosswalk = matches.sourceMemberships.rvd

test('membership paths retain historical list parentage without replacing the hierarchy', () => {
  const divisions = crosswalk.entries.map(entry => ({
    id: entry.divisionId,
    divisionCode: 'TEST',
    hierarchies: { full: [] },
  }))
  const records = crosswalk.entries.map(entry => ({
    sourceRecordId: entry.sourceRecordId,
    properties: { kind: 'subdistrict', areaCode: 'KL', districtCode: 'YTM' },
  }))
  const result = applyRvdMembership(divisions, records, crosswalk.sourceRelease)
  expect(result.matched).toBe(147)
  expect(result.unmatched).toHaveLength(1)
  expect((divisions[0] as any).memberships[0]).toMatchObject({
    key: 'KL:YTM:TEST',
    keyAuthority: 'saanseoi',
    dataset: 'ds-hk-hkgov-rvd-division',
  })
  expect(divisions[0]!.hierarchies.full).toEqual([])
  expect(() => applyRvdMembership(divisions, records, 'different-release')).toThrow(
    'release mismatch',
  )
})
