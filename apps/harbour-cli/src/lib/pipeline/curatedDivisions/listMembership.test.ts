import { expect, test } from 'bun:test'
import { applyCuratedBounds, applyRvdMembership } from './listMembership'
import matches from '../../../../../../fixtures/meta/curations/saanseoi-division/division-identity-matches.json'
const crosswalk = matches.sourceMemberships.rvd

test('China bounds retain OSM attribution without fabricating a representative point', () => {
  const china: any = {
    id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
    bbox: null,
    geometry: null,
    sources: {},
  }
  const extra = [
    'd1e1327a-28ff-4487-9103-df158b9c94a0',
    'ss-f717fc08-8be5-5037-a609-6aa415cca15c',
  ].map(id => ({ id, bbox: null, sources: {} }))
  applyCuratedBounds([china, ...extra])
  expect(china.bbox).toEqual([73.4997347, 8.6650385, 134.7754563, 53.5608154])
  expect(china.geometry).toBeNull()
  expect(china.sources.openstreetmap[0].record_id).toBe('relation/270056')
})

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
