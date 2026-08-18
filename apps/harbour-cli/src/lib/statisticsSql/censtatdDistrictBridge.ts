import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  createHkgovCenstatdDistrictResolution,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisionStatistics'
import { metaSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'

type DistrictBridgeCohortKey = '2016' | '2021'

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

/** Resolves a complete reviewed C&SD district bridge through canonical HAD IDs. */
export async function resolveHkgovCenstatdDistrictBridge(
  metaDb: HarbourReadableDb,
  cohortKey: DistrictBridgeCohortKey,
): Promise<ReadonlyMap<number, ResolvedHkgovCenstatdDistrict>> {
  const [censtatdRows, hadRows] = await Promise.all([
    metaDb
      .select({
        canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
        externalCode: metaSchema.metaIdentifierBridges.externalCode,
      })
      .from(metaSchema.metaIdentifierBridges)
      .where(
        and(
          eq(metaSchema.metaIdentifierBridges.authority, 'hkgov-censtatd'),
          eq(metaSchema.metaIdentifierBridges.cohortKey, cohortKey),
          eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
          eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
        ),
      )
      .all(),
    metaDb
      .select({
        canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
        externalCode: metaSchema.metaIdentifierBridges.externalCode,
      })
      .from(metaSchema.metaIdentifierBridges)
      .where(
        and(
          eq(metaSchema.metaIdentifierBridges.authority, 'hkgov-had'),
          eq(metaSchema.metaIdentifierBridges.cohortKey, '2022'),
          eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
          eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
        ),
      )
      .all(),
  ])

  return createHkgovCenstatdDistrictResolution(censtatdRows, hadRows)
}
