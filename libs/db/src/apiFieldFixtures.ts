import apiDivisionsV01FixtureOverture112To115 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.12-to-1.15.json'
import apiDivisionsV01FixtureOvertureRequiredOnly112To115 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-required-only-1.12-to-1.15.json'
import apiDivisionsV01FixtureOverture116To117 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.16-to-1.17.json'
import apiDivisionsV01FixtureOvertureRequiredOnly116To117 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-required-only-1.16-to-1.17.json'
import apiDivisionsV01FixturePlandNewTown2006 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-new-town-2006.json'
import apiDivisionsV01FixturePlandPu2001 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2001.json'
import apiDivisionsV01FixturePlandPu2021 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2021.json'
import apiAddressesV01FixtureDefaultLineage from '../../../fixtures/meta/apiFields/api-addresses-v0.1@default-lineage.json'

import type { ProvenanceContributionType, ResolverCode } from './constants/schema'

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

const apiFieldFixtures: ApiFieldFixture[] = [
  apiDivisionsV01FixtureOverture112To115 as ApiFieldFixture,
  apiDivisionsV01FixtureOvertureRequiredOnly112To115 as ApiFieldFixture,
  apiDivisionsV01FixtureOverture116To117 as ApiFieldFixture,
  apiDivisionsV01FixtureOvertureRequiredOnly116To117 as ApiFieldFixture,
  apiDivisionsV01FixturePlandNewTown2006 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2001 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2021 as ApiFieldFixture,
  apiAddressesV01FixtureDefaultLineage as ApiFieldFixture,
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
