import apiDivisionsV01Fixture20250924 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-09-24.0.json'
import apiDivisionsV01Fixture20251022 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-10-22.0.json'
import apiDivisionsV01Fixture20251119 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-11-19.0.json'
import apiDivisionsV01Fixture20251217 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-12-17.0.json'
import apiDivisionsV01Fixture20260218 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-02-18.0.json'
import apiDivisionsV01Fixture20260520 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-05-20.0.json'
import apiDivisionsV01FixturePlandNewTown2006 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-new-town-2006.json'
import apiDivisionsV01FixturePlandPu2001 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2001.json'
import apiDivisionsV01FixturePlandPu2021 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2021.json'
import apiAddressesV01Fixture20260604 from '../../../fixtures/meta/apiFields/api-addresses-v0.1@ss-hk-address-2026-06-04.324.json'

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
  /**
   * Immutable snapshots that anchor this mapping on snapshot lineage branches.
   * The mapping applies to each anchor and its descendants only.
   */
  lineageAnchorSnapshotVersions: string[]
  schemaVersion: string
  rulesetVersion: string
  sourceSchemas: Record<string, string>
  fields: ApiFieldFixtureField[]
}

const apiFieldFixtures: ApiFieldFixture[] = [
  apiDivisionsV01Fixture20250924 as ApiFieldFixture,
  apiDivisionsV01Fixture20251022 as ApiFieldFixture,
  apiDivisionsV01Fixture20251119 as ApiFieldFixture,
  apiDivisionsV01Fixture20251217 as ApiFieldFixture,
  apiDivisionsV01Fixture20260218 as ApiFieldFixture,
  apiDivisionsV01Fixture20260520 as ApiFieldFixture,
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
    lineageAnchorSnapshotVersions: [...fixture.lineageAnchorSnapshotVersions],
    sourceSchemas: { ...fixture.sourceSchemas },
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
    .filter(
      fixture =>
        fixture.apiVersion === args.apiVersion &&
        fixture.domainCode === args.domainCode &&
        fixture.schemaVersion === args.schemaVersion &&
        fixture.rulesetVersion === args.rulesetVersion &&
        haveEqualSourceSchemas(fixture.sourceSchemas, args.sourceSchemas) &&
        fixture.lineageAnchorSnapshotVersions.some(snapshotVersion =>
          args.lineageSnapshotVersions.includes(snapshotVersion),
        ),
    )
    .sort(
      (left, right) =>
        Math.max(
          ...right.lineageAnchorSnapshotVersions.map(snapshotVersion =>
            args.lineageSnapshotVersions.lastIndexOf(snapshotVersion),
          ),
        ) -
        Math.max(
          ...left.lineageAnchorSnapshotVersions.map(snapshotVersion =>
            args.lineageSnapshotVersions.lastIndexOf(snapshotVersion),
          ),
        ),
    )

  return candidates[0] ? cloneApiFieldFixture(candidates[0]) : null
}
