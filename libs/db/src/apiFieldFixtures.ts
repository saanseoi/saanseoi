import apiDivisionsV01Fixture20250924 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-09-24.0.json'
import apiDivisionsV01Fixture20250924WithoutCenstatd from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-09-24.0-no-censtatd.json'
import apiDivisionsV01Fixture20251022 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-10-22.0.json'
import apiDivisionsV01Fixture20251119 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-11-19.0.json'
import apiDivisionsV01Fixture20251217 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-12-17.0.json'
import apiDivisionsV01Fixture20260218 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-02-18.0.json'
import apiDivisionsV01Fixture20260520 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-05-20.0.json'
import apiDivisionsV01FixturePlandNewTown2006 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-new-town-2006.json'
import apiDivisionsV01FixturePlandPu2001 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2001.json'
import apiDivisionsV01FixturePlandPu2021 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2021.json'
import apiAddressesV01Fixture20260604 from '../../../fixtures/meta/apiFields/api-addresses-v0.1@ss-hk-address-2026-06-04.0.json'

import type { ProvenanceContributionType, ResolverCode } from './constants/schema'
import { computeVersionHash } from './versioning'

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

const CENSTATD_DIVISION_AREA_DATASET = 'ds-hk-hkgov-censtatd-division-area-district'

function createFixtureWithoutCenstatdDivisionAreas(
  fixture: ApiFieldFixture,
): ApiFieldFixture {
  const lineageAnchors = fixture.lineageAnchors.map(anchor => ({
    snapshotVersion: anchor.snapshotVersion,
    sourceSchemas: Object.fromEntries(
      Object.entries(anchor.sourceSchemas).filter(
        ([datasetCode]) => datasetCode !== CENSTATD_DIVISION_AREA_DATASET,
      ),
    ),
  }))
  const fields = fixture.fields.filter(
    field => field.sourceDatasetCode !== CENSTATD_DIVISION_AREA_DATASET,
  )

  return {
    ...fixture,
    versionHash: computeVersionHash({
      apiVersion: fixture.apiVersion,
      domainCode: fixture.domainCode,
      fields,
      lineageAnchors,
      rulesetVersion: fixture.rulesetVersion,
      schemaVersion: fixture.schemaVersion,
    }),
    lineageAnchors,
    fields,
  }
}

const apiFieldFixtures: ApiFieldFixture[] = [
  apiDivisionsV01Fixture20250924 as ApiFieldFixture,
  apiDivisionsV01Fixture20250924WithoutCenstatd as ApiFieldFixture,
  apiDivisionsV01Fixture20251022 as ApiFieldFixture,
  apiDivisionsV01Fixture20251119 as ApiFieldFixture,
  apiDivisionsV01Fixture20251217 as ApiFieldFixture,
  apiDivisionsV01Fixture20260218 as ApiFieldFixture,
  createFixtureWithoutCenstatdDivisionAreas(
    apiDivisionsV01Fixture20260218 as ApiFieldFixture,
  ),
  apiDivisionsV01Fixture20260520 as ApiFieldFixture,
  createFixtureWithoutCenstatdDivisionAreas(
    apiDivisionsV01Fixture20260520 as ApiFieldFixture,
  ),
  apiDivisionsV01FixturePlandNewTown2006 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2001 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2021 as ApiFieldFixture,
  apiAddressesV01Fixture20260604 as ApiFieldFixture,
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
