import { hkDistricts, type HkDistrictCode } from '../../codes'

export type DistrictIdentifierBridgeRow = {
  canonicalId: string
  externalCode: string | null
}

export type ResolvedHkgovCenstatdDistrict = {
  districtCode: HkDistrictCode
  divisionId: string
}

export type HkgovCenstatdDistrictStatisticSource = {
  districtCode: number
  id: string
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  nameEn: string
  nameZhHant: string
  referenceYear: string
  sources: unknown
}

/**
 * Builds the reviewed C&SD-number to canonical-district bridge used only by
 * the published statistics layer. Source records include their raw `DC`.
 */
export function createHkgovCenstatdDistrictResolution(
  censtatdRows: readonly DistrictIdentifierBridgeRow[],
  hadRows: readonly DistrictIdentifierBridgeRow[],
) {
  const districtCodeByCanonicalId = new Map<string, HkDistrictCode>()
  for (const row of hadRows) {
    if (!row.externalCode || !isHkDistrictCode(row.externalCode)) continue
    if (districtCodeByCanonicalId.has(row.canonicalId)) {
      throw new Error(
        `Multiple HAD district codes map to canonical division ${row.canonicalId}.`,
      )
    }
    districtCodeByCanonicalId.set(row.canonicalId, row.externalCode)
  }

  const resolved = new Map<number, ResolvedHkgovCenstatdDistrict>()
  for (const row of censtatdRows) {
    if (!row.externalCode) continue
    const sourceDistrictCode = Number(row.externalCode)
    if (!Number.isSafeInteger(sourceDistrictCode)) {
      throw new Error(`Invalid C&SD district code=${row.externalCode}.`)
    }
    const districtCode = districtCodeByCanonicalId.get(row.canonicalId)
    if (!districtCode) {
      throw new Error(
        `C&SD district code=${sourceDistrictCode} has no reviewed canonical district code.`,
      )
    }
    if (resolved.has(sourceDistrictCode)) {
      throw new Error(`Duplicate C&SD district code=${sourceDistrictCode}.`)
    }
    resolved.set(sourceDistrictCode, {
      districtCode,
      divisionId: row.canonicalId,
    })
  }

  if (resolved.size !== hkDistricts.length) {
    throw new Error(
      `Expected ${hkDistricts.length} reviewed C&SD district mappings; found ${resolved.size}.`,
    )
  }
  const resolvedDistrictCodes = new Set(
    [...resolved.values()].map(row => row.districtCode),
  )
  for (const districtCode of hkDistricts) {
    if (!resolvedDistrictCodes.has(districtCode)) {
      throw new Error(
        `The reviewed identifier bridges have no C&SD mapping for districtCode=${districtCode}.`,
      )
    }
  }

  return resolved
}

/**
 * Produces public Division Statistics attributes from one source record.
 * `MYPOPN_LAND` has already been converted from thousands to people upstream.
 */
export function buildHkgovCenstatdDistrictStatisticHistoryRecord(
  source: HkgovCenstatdDistrictStatisticSource,
  resolved: ResolvedHkgovCenstatdDistrict,
) {
  return {
    districtCode: resolved.districtCode,
    divisionId: resolved.divisionId,
    id: source.id,
    landAreaSqKm: source.landAreaSqKm,
    midYearPopulation: source.midYearPopulation,
    midYearPopulationDensityPerSqKm: source.midYearPopulationDensityPerSqKm,
    referenceYear: source.referenceYear,
    sources: source.sources,
  }
}

function isHkDistrictCode(value: string): value is HkDistrictCode {
  return (hkDistricts as readonly string[]).includes(value)
}
