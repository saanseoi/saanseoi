import apiDivisionsV01FixtureOverture112To115 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.12-to-1.15.json'
import apiDivisionsV01FixtureOverture116To118 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.16-to-1.18.json'
import apiDivisionsV01FixturePlandNewTown2006 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-new-town-2006.json'
import apiDivisionsV01FixturePlandPu2001 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2001.json'
import apiDivisionsV01FixturePlandPu2021 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2021.json'
import apiAddressesV01FixtureOfficialLineage from '../../../fixtures/meta/apiFields/api-addresses-v0.1@official-lineage.json'

import type { ProvenanceContributionType, ResolverCode } from './constants/schema'
import { computeVersionHash } from './versioning'

const populationHouseholdsDistrictDataset =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
const permanentLivingQuartersDataset =
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'

export type ApiFieldFixtureField = {
  apiField: string
  /** Geometry-source selector; omitted for fields independent of a variant. */
  variant?: string | null
  sourceDatasetCode: string
  sourceFieldPath: string
  resolverCode: ResolverCode
  contributionType: ProvenanceContributionType
  priority: number
  confidence?: number | null
}

export type ApiFieldFixture = {
  versionHash: string
  apiVersion: string
  /** Domain this mapping applies to. */
  domainCode: string
  lineageAnchors: ApiFieldFixtureLineageAnchor[]
  schemaVersion: string
  rulesetVersion: string
  fields: ApiFieldFixtureField[]
}

export type ApiFieldFixtureLineageAnchor = {
  /** Immutable snapshot at which this mapping applies on one lineage branch. */
  snapshotVersion: string
  /** Exact release-set source signature for this branch anchor. */
  sourceSchemas: Record<string, string>
}

/**
 * Permanent Living Quarters supplies the same C&SD area variant as the annual
 * district dataset, but Geographic Divisions can be initialised before that
 * annual source is available. Keep its exact release signature distinct.
 */
function derivePermanentLivingQuartersFixture(
  fixture: ApiFieldFixture,
): ApiFieldFixture {
  const derivedFixture = {
    ...fixture,
    lineageAnchors: fixture.lineageAnchors.flatMap(anchor => {
      if (
        anchor.sourceSchemas[permanentLivingQuartersDataset] !== '1.0' ||
        anchor.sourceSchemas[populationHouseholdsDistrictDataset] !== '1.0'
      ) {
        return []
      }

      const { [populationHouseholdsDistrictDataset]: _omitted, ...sourceSchemas } =
        anchor.sourceSchemas
      return [{ ...anchor, sourceSchemas }]
    }),
    fields: fixture.fields.map(field =>
      field.sourceDatasetCode === populationHouseholdsDistrictDataset
        ? { ...field, sourceDatasetCode: permanentLivingQuartersDataset }
        : field,
    ),
  }

  return {
    ...derivedFixture,
    versionHash: computeVersionHash(derivedFixture),
  }
}

const apiFieldFixtures: ApiFieldFixture[] = [
  apiDivisionsV01FixtureOverture112To115 as unknown as ApiFieldFixture,
  derivePermanentLivingQuartersFixture(
    apiDivisionsV01FixtureOverture112To115 as unknown as ApiFieldFixture,
  ),
  apiDivisionsV01FixtureOverture116To118 as unknown as ApiFieldFixture,
  derivePermanentLivingQuartersFixture(
    apiDivisionsV01FixtureOverture116To118 as unknown as ApiFieldFixture,
  ),
  apiDivisionsV01FixturePlandNewTown2006 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2001 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2021 as ApiFieldFixture,
  apiAddressesV01FixtureOfficialLineage as ApiFieldFixture,
]

function cloneApiFieldFixtureField(field: ApiFieldFixtureField): ApiFieldFixtureField {
  return {
    ...field,
  }
}

function cloneApiFieldFixture(fixture: ApiFieldFixture): ApiFieldFixture {
  return {
    ...fixture,
    lineageAnchors: fixture.lineageAnchors.map(anchor => ({
      ...anchor,
      sourceSchemas: { ...anchor.sourceSchemas },
    })),
    fields: fixture.fields.map(cloneApiFieldFixtureField),
  }
}

function haveEqualSourceSchemas(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(
    (key, index) => key === rightKeys[index] && left[key] === right[key],
  )
}

function closestMatchingAnchorDepth(
  fixture: ApiFieldFixture,
  matchingAnchorIndexes: number[],
  lineageSnapshotVersions: string[],
) {
  return Math.max(
    ...matchingAnchorIndexes.map(index => {
      const anchor = fixture.lineageAnchors[index]
      return anchor ? lineageSnapshotVersions.lastIndexOf(anchor.snapshotVersion) : -1
    }),
  )
}

export function listApiFieldFixtures() {
  return apiFieldFixtures.map(cloneApiFieldFixture)
}

export function resolveApiFieldFixture(args: {
  apiVersion: string
  domainCode: string
  /** Snapshot codes from the primary snapshot's lineage root to itself. */
  lineageSnapshotVersions: string[]
  schemaVersion: string
  rulesetVersion: string
  sourceSchemas: Record<string, string>
}) {
  const candidates = apiFieldFixtures
    .map(fixture => ({
      fixture,
      matchingAnchorIndexes: fixture.lineageAnchors.flatMap((anchor, index) =>
        haveEqualSourceSchemas(anchor.sourceSchemas, args.sourceSchemas) &&
        args.lineageSnapshotVersions.includes(anchor.snapshotVersion)
          ? [index]
          : [],
      ),
    }))
    .filter(
      ({ fixture, matchingAnchorIndexes }) =>
        fixture.apiVersion === args.apiVersion &&
        fixture.domainCode === args.domainCode &&
        fixture.schemaVersion === args.schemaVersion &&
        fixture.rulesetVersion === args.rulesetVersion &&
        matchingAnchorIndexes.length > 0,
    )
    .sort(
      (left, right) =>
        closestMatchingAnchorDepth(
          right.fixture,
          right.matchingAnchorIndexes,
          args.lineageSnapshotVersions,
        ) -
        closestMatchingAnchorDepth(
          left.fixture,
          left.matchingAnchorIndexes,
          args.lineageSnapshotVersions,
        ),
    )

  return candidates[0] ? cloneApiFieldFixture(candidates[0].fixture) : null
}
