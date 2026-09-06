import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliases.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Resolve only explicitly reviewed aliases, leaving rows intact until 3D validation succeeds. */
export function resolveAlsAddressAliases(
  rows: PreparedHkgovAlsRow[],
  sourceVersion: string,
) {
  const aliases = new Map<
    string,
    {
      owner: PreparedHkgovAlsRow
      duplicate: PreparedHkgovAlsRow
      decision: (typeof fixture.aliases)[number]
    }
  >()
  for (const decision of fixture.aliases) {
    if (
      sourceVersion < decision.sourceVersionFrom ||
      sourceVersion > decision.sourceVersionTo
    )
      continue
    const candidates = rows.filter(row => row.hkgovCsuId === decision.csu)
    if (!candidates.length) continue
    const owner = candidates.find(
      row => row.enBlockNumber === null && row.zhHantBlockNumber === null,
    )
    const duplicate = candidates.find(
      row =>
        row.enBlockNumber === decision.blockNumber &&
        row.zhHantBlockNumber === decision.blockNumber,
    )
    const fail = () => {
      throw new Error(
        `ALS alias ${decision.id}: source components changed; review required`,
      )
    }
    if (candidates.length !== 2 || !owner || !duplicate || owner.id === duplicate.id) {
      fail()
      continue
    }
    if (
      owner.enEstateName !== decision.estate ||
      duplicate.enEstateName !== decision.estate ||
      owner.enBuildingName !== decision.enBuildingName ||
      owner.zhHantBuildingName !== decision.zhHantBuildingName ||
      owner.geometry !== duplicate.geometry
    )
      fail()
    for (const [field, blockKey] of [
      ['engPremisesAddressJson', 'EngBlock'],
      ['chiPremisesAddressJson', 'ChiBlock'],
    ] as const) {
      const ownerRaw = owner[field]
      const duplicateRaw = duplicate[field]
      if (!ownerRaw || !duplicateRaw) {
        fail()
        continue
      }
      const a = JSON.parse(ownerRaw)
      const b = JSON.parse(duplicateRaw)
      if (a[blockKey] || String(b[blockKey]?.BlockNo) !== decision.blockNumber) fail()
      const acceptedNames =
        blockKey === 'EngBlock'
          ? decision.duplicateEnBuildingNames
          : decision.duplicateZhBuildingNames
      if (!acceptedNames.includes(b.BuildingName)) fail()
      b.BuildingName = a.BuildingName
      delete b[blockKey]
      if (canonical(a) !== canonical(b)) fail()
    }
    aliases.set(duplicate.id, { owner, duplicate, decision })
  }
  return aliases
}

export function suppressAlsAddressAliases(
  rows: PreparedHkgovAlsRow[],
  aliases: ReturnType<typeof resolveAlsAddressAliases>,
) {
  for (const { owner, duplicate, decision } of aliases.values()) {
    owner.curatedGranularity = 'building'
    const sources = JSON.parse(owner.sources ?? '{}')
    owner.sources = JSON.stringify({
      ...sources,
      hkgovAlsAddressAliases: [
        ...(sources.hkgovAlsAddressAliases ?? []),
        {
          dataset: 'saanseoi-address-alias',
          ...decision,
          suppressedAddressId: duplicate.id,
          sourceEvidence: {
            sources: JSON.parse(duplicate.sources ?? '{}'),
            engPremisesAddress: JSON.parse(duplicate.engPremisesAddressJson ?? 'null'),
            chiPremisesAddress: JSON.parse(duplicate.chiPremisesAddressJson ?? 'null'),
          },
        },
      ],
    })
  }
  const retained = rows.filter(row => !aliases.has(row.id))
  rows.splice(0, rows.length, ...retained)
}
