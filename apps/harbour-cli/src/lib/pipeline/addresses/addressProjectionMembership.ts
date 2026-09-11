import type { Database } from 'bun:sqlite'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'

/** Compare the resolved rows with the exact canonical inventory reviewed locally. */
export function assertAddressProjectionMembership(
  db: Database,
  scopeId: string,
  membership: AlsMembership,
) {
  const addresses = new Map(membership.addresses.map(row => [row.id, row]))
  let addressCount = 0
  const addressRows = db.prepare<
    { id: string; parentAddressId: string | null; granularity: string },
    [string]
  >('SELECT id,parentAddressId,granularity FROM address2d WHERE snapshotId=?')
  try {
    for (const row of addressRows.iterate(scopeId)) {
      const expected = addresses.get(row.id)
      if (
        !expected ||
        row.parentAddressId !== expected.parentId ||
        row.granularity !== expected.level
      )
        throw new Error(
          'Address projection does not match the reviewed canonical membership.',
        )
      addressCount++
    }
  } finally {
    addressRows.finalize()
  }
  if (addressCount !== membership.addresses.length || addresses.size !== addressCount)
    throw new Error(
      'Address projection does not match the reviewed canonical membership.',
    )

  const collections = new Map(membership.collections.map(row => [row.id, row]))
  let collectionCount = 0
  const collectionRows = db.prepare<
    { id: string; address2dId: string; units: string; unresolvedSectionIds: string },
    [string]
  >(
    'SELECT id,address2dId,units,unresolvedSectionIds FROM address3d WHERE snapshotId=?',
  )
  try {
    for (const row of collectionRows.iterate(scopeId)) {
      const expected = collections.get(row.id)
      const units = JSON.parse(row.units) as Array<{ id: string }>
      const unitIds = new Set(units.map(unit => unit.id))
      const sections = JSON.parse(row.unresolvedSectionIds) as string[]
      const sectionIds = new Set(sections)
      if (
        !expected ||
        row.address2dId !== expected.ownerId ||
        units.length !== expected.units.length ||
        unitIds.size !== units.length ||
        expected.units.some(([id]) => !unitIds.has(id)) ||
        sections.length !== (expected.unresolvedSectionIds?.length ?? 0) ||
        sectionIds.size !== sections.length ||
        expected.unresolvedSectionIds?.some(id => !sectionIds.has(id))
      )
        throw new Error(
          'Address3D projection does not match the reviewed canonical membership.',
        )
      collectionCount++
    }
  } finally {
    collectionRows.finalize()
  }
  if (
    collectionCount !== membership.collections.length ||
    collections.size !== collectionCount
  )
    throw new Error(
      'Address3D projection does not match the reviewed canonical membership.',
    )
}
