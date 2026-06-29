import apiDivisionsV01Fixture20250924 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-09-24.0.json'
import apiDivisionsV01Fixture20251022 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-10-22.0.json'
import apiDivisionsV01Fixture20251119 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-11-19.0.json'
import apiDivisionsV01Fixture20251217 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2025-12-17.0.json'
import apiDivisionsV01Fixture20260218 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-02-18.0.json'
import apiDivisionsV01Fixture20260520 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-05-20.0.json'

import type { ProvenanceContributionType, ResolverCode } from './constants/schema'

export type ApiFieldFixtureField = {
  apiField: string
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
  validFromSnapshotVersion: string
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
]

function compareSnapshotVersions(left: string, right: string) {
  const leftMatch = left.match(
    /^ss-[a-z0-9]+-[a-z0-9-]+-(20\d{2}-\d{2}-\d{2})\.(\d+)$/i,
  )
  const rightMatch = right.match(
    /^ss-[a-z0-9]+-[a-z0-9-]+-(20\d{2}-\d{2}-\d{2})\.(\d+)$/i,
  )

  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right)
  }

  const leftDate = leftMatch[1]
  const rightDate = rightMatch[1]

  if (!leftDate || !rightDate) {
    return left.localeCompare(right)
  }

  const leftPatch = leftMatch[2] ?? '0'
  const rightPatch = rightMatch[2] ?? '0'
  const dateComparison = leftDate.localeCompare(rightDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  return Number.parseInt(leftPatch, 10) - Number.parseInt(rightPatch, 10)
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
  return apiFieldFixtures
}

export function resolveApiFieldFixture(args: {
  apiVersion: string
  snapshotVersion: string
  schemaVersion: string
  rulesetVersion: string
  sourceSchemas: Record<string, string>
}) {
  const candidates = apiFieldFixtures
    .filter(
      fixture =>
        fixture.apiVersion === args.apiVersion &&
        fixture.schemaVersion === args.schemaVersion &&
        fixture.rulesetVersion === args.rulesetVersion &&
        haveEqualSourceSchemas(fixture.sourceSchemas, args.sourceSchemas) &&
        compareSnapshotVersions(
          fixture.validFromSnapshotVersion,
          args.snapshotVersion,
        ) <= 0,
    )
    .sort((left, right) =>
      compareSnapshotVersions(
        right.validFromSnapshotVersion,
        left.validFromSnapshotVersion,
      ),
    )

  return candidates[0] ?? null
}
