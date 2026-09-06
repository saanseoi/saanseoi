import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const NAMESPACE = 'b2da2675-daca-5920-a99e-c4d562a4c950'
type HierarchyRow = PreparedHkgovAlsRow & {
  parentAddressId?: string
  curatedGranularity?: 'complex' | 'building' | 'section'
  hierarchyCuration?: string
}

/** Guards match publisher components before any synthetic row is introduced. */
export function applyAlsAddressHierarchies(
  rows: HierarchyRow[],
  sourceVersion: string,
) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  const sourceByCsu = new Map<string, HierarchyRow[]>()
  const estateNames = new Set(rows.map(row => row.enEstateName))
  for (const row of rows) {
    if (row.hkgovCsuId)
      sourceByCsu.set(row.hkgovCsuId, [...(sourceByCsu.get(row.hkgovCsuId) ?? []), row])
  }
  for (const relationship of fixture.relationships) {
    if (
      sourceVersion < relationship.sourceVersionFrom ||
      sourceVersion > relationship.sourceVersionTo
    )
      continue
    if (!estateNames.has(relationship.complex.enName)) continue
    const matches = relationship.buildings.map(building => {
      const candidates = (sourceByCsu.get(building.source.hkgovCsuId) ?? []).filter(
        row =>
          row.enEstateName === relationship.complex.enName &&
          row.enBuildingName === building.expected.enBuildingName &&
          row.zhHantBuildingName === building.expected.zhHantBuildingName,
      )
      if (!candidates.length)
        throw new Error(`ALS hierarchy ${building.id}: source premise is missing`)
      for (const row of candidates) {
        for (const [key, expected] of Object.entries(building.expected)) {
          if (row[key as keyof PreparedHkgovAlsRow] !== expected)
            throw new Error(
              `ALS hierarchy ${building.id}: ${key} changed; review required`,
            )
        }
      }
      const sections = 'sections' in building ? building.sections : undefined
      if (sections) {
        if (new Set(candidates.map(row => row.geometry)).size !== 1)
          throw new Error(
            `ALS hierarchy ${building.id}: section coordinates disagree; review required`,
          )
        const expected = sections
          .map(section =>
            JSON.stringify([section.enStreetNumberFrom, section.enStreetNumberTo]),
          )
          .sort()
        const actual = candidates
          .map(row => JSON.stringify([row.enStreetNumberFrom, row.enStreetNumberTo]))
          .sort()
        if (JSON.stringify(expected) !== JSON.stringify(actual))
          throw new Error(
            `ALS hierarchy ${building.id}: section membership changed; review required`,
          )
      } else if (candidates.length !== 1)
        throw new Error(`ALS hierarchy ${building.id}: ambiguous building owner`)
      return { building, candidates }
    })
    const template = matches[0]?.candidates[0]
    if (!template) throw new Error(`ALS hierarchy ${relationship.id}: no template`)
    // Reuse a publisher estate-level record only when it is unambiguously a complex.
    const complexes = rows.filter(
      row =>
        row.enEstateName === relationship.complex.enName &&
        row.enDistrict === template.enDistrict &&
        !row.enBuildingName &&
        !row.enBlockNumber &&
        !row.enStreetNumberFrom &&
        !row.enStreetNumberTo,
    )
    if (complexes.length > 1)
      throw new Error(`ALS hierarchy ${relationship.id}: multiple complex candidates`)
    const complex =
      complexes[0] ??
      derivedRow(template, relationship.id, {
        enBuildingName: null,
        zhHantBuildingName: null,
        enBlockNumber: null,
        zhHantBlockNumber: null,
        enBlockDescriptor: null,
        zhHantBlockDescriptor: null,
        enStreetName: null,
        zhHantStreetName: null,
        enStreetNumberFrom: null,
        enStreetNumberTo: null,
        zhHantStreetNumberFrom: null,
        zhHantStreetNumberTo: null,
        enFormattedAddress: relationship.complex.enName,
        zhHantFormattedAddress: relationship.complex.zhHantName,
      })
    complex.curatedGranularity = 'complex'
    complex.hierarchyCuration = relationship.id
    if (!complexes.length) rows.push(complex)
    for (const { building, candidates } of matches) {
      const first = candidates[0]
      if (!first) throw new Error(`Missing ${building.id}`)
      const range =
        'curatedParentRange' in building ? building.curatedParentRange : undefined
      const parent = range
        ? derivedRow(first, building.id, {
            enStreetNumberFrom: range.from,
            enStreetNumberTo: range.to,
            zhHantStreetNumberFrom: range.from,
            zhHantStreetNumberTo: range.to,
            enFormattedAddress: `${first.enBuildingName}, ${relationship.complex.enName}, ${range.from}–${range.to} ${relationship.complex.streetName}`,
            zhHantFormattedAddress: `${relationship.complex.zhHantStreetName}${range.from}–${range.to}號${relationship.complex.zhHantName}${first.zhHantBuildingName}`,
          })
        : first
      parent.curatedGranularity = 'building'
      parent.parentAddressId = complex.id
      parent.hierarchyCuration = building.id
      if (range) rows.push(parent)
      const derivedSections =
        'derivedSections' in building ? building.derivedSections : undefined
      const derivedChildren = (derivedSections ?? []).map(section => {
        const child = derivedRow(parent, section.id, {
          enBuildingName: section.enName,
          zhHantBuildingName: section.zhHantName,
          enFormattedAddress:
            parent.enFormattedAddress?.replace(
              parent.enBuildingName ?? '',
              section.enName,
            ) ?? section.enName,
          zhHantFormattedAddress:
            parent.zhHantFormattedAddress?.replace(
              parent.zhHantBuildingName ?? '',
              section.zhHantName,
            ) ?? section.zhHantName,
          parentAddressId: parent.id,
          curatedGranularity: 'section',
          hierarchyCuration: building.id,
        })
        rows.push(child)
        return child
      })
      for (const child of candidates) {
        if (range) {
          child.parentAddressId = parent.id
          child.curatedGranularity = 'section'
          child.hierarchyCuration = building.id
        }
        ownership.set(child.id, {
          ownerId: parent.id,
          physicalBuildingId: parent.id,
          unresolvedSectionIds: [
            ...(range ? candidates.map(row => row.id) : []),
            ...derivedChildren.map(row => row.id),
          ].sort(),
        })
      }
    }
  }
  return ownership
}

function derivedRow(
  template: HierarchyRow,
  curationId: string,
  fields: Partial<HierarchyRow>,
): HierarchyRow {
  const id = buildDeterministicUuidV5(NAMESPACE, curationId)
  return {
    ...template,
    ...fields,
    id,
    canonicalId: id,
    hkgovCsuId: null,
    geoAddress: null,
    identifiers: JSON.stringify({ curationId }),
    // A derived parent is curation evidence, never a publisher ALS occurrence.
    sources: JSON.stringify([
      {
        dataset: 'saanseoi-address-hierarchy',
        curationId,
        revision: 1,
        derivedFrom: template.id,
      },
    ]),
    sourceFile: 'hkgov-dpo-address-hierarchies.json',
    sourceFeatureIndexOneBased: 0,
    chiPremisesAddressJson: null,
    engPremisesAddressJson: null,
    identityAlias: null,
    identityBuildingId: id,
    identityKey: id,
    identityContinuityKey: id,
    identityMatchMethod: 'reviewed-address-hierarchy',
    identityNumberFrom: null,
    identityNumberTo: null,
  }
}
