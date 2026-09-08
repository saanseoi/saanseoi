import {
  createHkgovCenstatdDistrictResolution,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisionStatistics'
import { resolveIdentityCuration } from '../identityCurations'
import fixture from '../../../../../fixtures/meta/processing-rules/censtatd-district-identity.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { captureCurationDocuments, curationDocumentsFor } from '../curationDocuments'

type DistrictBridgeCohortKey = '2016' | '2021'

type NewTownBridgeCohortKey = '2021'

type IdentifierBridgeRow = {
  canonicalId: string
  externalId: string
}

export type ResolvedHkgovCenstatdNewTown = {
  divisionId: string
  newTownCode: string
}

const subdividedUnitsDatasetCode =
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'

/**
 * Returns the reviewed C&SD district-geography cohort represented by a
 * statistics release. A null result is intentional: the source's geography
 * has no matching canonical Divisions domain yet, so assigning a district ID
 * would be an unsupported spatial inference.
 */
export function resolveCenstatdDistrictBridgeCohort(
  datasetCode: string,
  sourceVersion: string,
): DistrictBridgeCohortKey | null {
  switch (datasetCode) {
    case 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district':
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district':
    case 'ds-hk-hkgov-censtatd-division-statistic-population-households-district':
      return '2021'
    case subdividedUnitsDatasetCode:
      if (sourceVersion === '2016' || sourceVersion === '2021') return sourceVersion
      throw new Error(
        `C&SD subdivided-units sourceVersion=${sourceVersion} has no reviewed district bridge.`,
      )
    default:
      return null
  }
}

/** Returns the reviewed C&SD New Town cohort represented by a statistic release. */
export function resolveCenstatdNewTownBridgeCohort(
  datasetCode: string,
  sourceVersion: string,
): NewTownBridgeCohortKey | null {
  if (datasetCode !== 'ds-hk-hkgov-censtatd-division-statistic-new-towns') {
    return null
  }
  if (sourceVersion === '2021') return sourceVersion
  throw new Error(
    `C&SD New Town sourceVersion=${sourceVersion} has no reviewed New Town bridge.`,
  )
}

/** Resolves a complete reviewed C&SD district bridge through canonical HAD IDs. */
export async function resolveHkgovCenstatdDistrictBridge(
  cohortKey: DistrictBridgeCohortKey,
): Promise<ReadonlyMap<number, ResolvedHkgovCenstatdDistrict>> {
  return censtatdDistrictIdentityRule.execute(cohortKey)
}

export const censtatdDistrictIdentityRule = registerRule(
  ruleDeclarationFromFixture(fixture),
  (cohortKey: DistrictBridgeCohortKey, parameters) => {
    const censtatdRows = resolveIdentityCuration(
      parameters.sourceAuthority,
      cohortKey,
      parameters.domain,
    )
    const hadRows = resolveIdentityCuration(
      parameters.targetAuthority,
      parameters.targetCohort,
      parameters.domain,
    )

    return captureCurationDocuments(
      createHkgovCenstatdDistrictResolution(censtatdRows, hadRows),
      curationDocumentsFor(censtatdRows, hadRows),
    )
  },
)

/**
 * Resolves the reviewed 2021 C&SD New Town codes through the curated identifier
 * bridge, rather than attempting a translated-name or geometry match during
 * statistics upload.
 */
export async function resolveHkgovCenstatdNewTownBridge(
  cohortKey: NewTownBridgeCohortKey,
): Promise<ReadonlyMap<string, ResolvedHkgovCenstatdNewTown>> {
  const rows = resolveIdentityCuration('hkgov-censtatd', cohortKey, 'new-town')

  return captureCurationDocuments(
    createHkgovCenstatdNewTownResolution(rows as IdentifierBridgeRow[], cohortKey),
    curationDocumentsFor(rows),
  )
}

export function createHkgovCenstatdNewTownResolution(
  rows: readonly IdentifierBridgeRow[],
  cohortKey: NewTownBridgeCohortKey,
): ReadonlyMap<string, ResolvedHkgovCenstatdNewTown> {
  const resolved = new Map<string, ResolvedHkgovCenstatdNewTown>()
  for (const row of rows) {
    if (resolved.has(row.externalId)) {
      throw new Error(`Duplicate C&SD New Town code=${row.externalId}.`)
    }
    resolved.set(row.externalId, {
      divisionId: row.canonicalId,
      newTownCode: row.externalId,
    })
  }

  if (resolved.size !== 13) {
    throw new Error(
      `Expected 13 reviewed C&SD New Town mappings for ${cohortKey}; found ${resolved.size}.`,
    )
  }
  return resolved
}
