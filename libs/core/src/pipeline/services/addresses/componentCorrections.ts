import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-components.json'

const componentKeys = new Set([
  'enBuildingName',
  'zhHantBuildingName',
  'enEstateName',
  'zhHantEstateName',
])

/** Apply reviewed component classification only to a copy of the prepared row. */
export function correctHkgovAddressComponents(
  row: Record<string, unknown>,
  sourceVersion: unknown = row.sourceVersion,
) {
  if (fixture.version !== 1)
    throw new Error('Unsupported ALS component fixture version.')
  let corrected = row
  const applied: Array<{ id: string; revision: number }> = []
  for (const correction of fixture.corrections) {
    const knownGeoAddress = correction.source.geoAddresses.some(
      value => row.geoAddress === value,
    )
    if (row.hkgovCsuId !== correction.source.hkgovCsuId && !knownGeoAddress) continue

    const fail = (detail: string): never => {
      throw new Error(
        `ALS component correction ${correction.id} requires review: ${detail}`,
      )
    }
    const version = typeof sourceVersion === 'string' ? sourceVersion : ''
    const compareVersion = (left: string, right: string) => {
      const [leftDate = '', leftRevision = ''] = left.split('.')
      const [rightDate = '', rightRevision = ''] = right.split('.')
      return (
        leftDate.localeCompare(rightDate) ||
        Number(leftRevision) - Number(rightRevision)
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(version))
      fail('missing or invalid source version')
    if (compareVersion(version, correction.sourceVersionFrom) < 0) continue
    if (
      correction.sourceVersionTo &&
      compareVersion(version, correction.sourceVersionTo) > 0
    )
      continue
    if (row.hkgovCsuId !== correction.source.hkgovCsuId || !knownGeoAddress)
      fail('unexpected source identity')
    for (const [key, expected] of Object.entries(correction.expected)) {
      const actual = row[key] === '' || row[key] == null ? null : row[key]
      if (actual !== expected) fail(`unexpected ${key}`)
    }
    for (const [key, value] of Object.entries(correction.overrides)) {
      if (!componentKeys.has(key)) fail(`unsupported override field ${key}`)
      if (value && correction.excludedNames.includes(value))
        fail(`excluded name in ${key}`)
    }
    // Component reassignment retains the same display text; spelling changes need
    // a separate formatting decision so structured and formatted names cannot drift.
    for (const prefix of ['en', 'zhHant'] as const) {
      if (
        correction.overrides[`${prefix}EstateName`] !== row[`${prefix}BuildingName`]
      ) {
        fail(`estate name must preserve the ${prefix} source building label`)
      }
    }
    corrected = { ...corrected, ...correction.overrides }
    applied.push({ id: correction.id, revision: correction.revision })
  }
  return { row: corrected, applied }
}
