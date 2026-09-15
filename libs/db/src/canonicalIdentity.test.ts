import { expect, test } from 'bun:test'
import { canonicalGeometryId, canonicalGeneratedId } from './canonicalIdentity'

test('canonical geometry identities are stable UUIDs scoped to provider and entity kind', () => {
  const id = canonicalGeometryId('divisionArea', 'hkgov-censtatd', 'CENSTATD:11')
  expect(id).toMatch(
    /^ss-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(canonicalGeometryId('divisionArea', 'hkgov-censtatd', 'CENSTATD:11')).toBe(id)
  expect(
    canonicalGeometryId('divisionBoundary', 'hkgov-censtatd', 'CENSTATD:11'),
  ).not.toBe(id)
  expect(canonicalGeometryId('divisionArea', 'overture', 'CENSTATD:11')).not.toBe(id)
  expect(canonicalGeneratedId(id)).toBe(id)
})
