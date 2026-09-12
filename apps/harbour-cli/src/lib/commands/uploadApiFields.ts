import type { UploadPlan } from '@repo/core'
import { listApiFieldFixtures } from '@repo/db/apiFieldFixtures'
import { comparePublisherSchemaVersions } from '@repo/db/apiFieldFixtures'
import { getApiFamilyForResourceType } from '@repo/db'
import { resolveDivisionDomainCode } from './uploadReadiness'

/** Check the incoming source before dispatch; full composition/lineage selection stays at publication. */
export function assertUploadApiFieldCompatibility(
  plan: Pick<UploadPlan, 'resourceType' | 'source' | 'datasetCode' | 'releaseCode'>,
  sourceSchemaVersion: string,
): { status: 'covered'; mappings: string[] } | { status: 'not-covered' } {
  const family = getApiFamilyForResourceType(plan.resourceType)
  const domain =
    family === 'divisions'
      ? resolveDivisionDomainCode(plan.source, plan.datasetCode)
      : family === 'addresses'
        ? 'saanseoi'
        : family === 'places'
          ? 'overture'
          : family === 'stats'
            ? 'government'
            : null
  const fixtures = listApiFieldFixtures().filter(
    fixture =>
      fixture.apiVersion.startsWith(`api-${family}-v`) && fixture.domainCode === domain,
  )
  // Match the publication gate's scope: families/domains without fixtures remain unsupported by this check.
  if (!fixtures.length) return { status: 'not-covered' }
  const candidates = fixtures.filter(fixture =>
    Object.hasOwn(fixture.publisherSchemaRanges, plan.datasetCode),
  )
  const supported = candidates.filter(fixture => {
    const range = fixture.publisherSchemaRanges[plan.datasetCode]!
    return (
      comparePublisherSchemaVersions(sourceSchemaVersion, range.min) >= 0 &&
      comparePublisherSchemaVersions(sourceSchemaVersion, range.max) <= 0
    )
  })
  const filename = (fixture: (typeof fixtures)[number]) =>
    `${fixture.apiVersion}@${fixture.domainCode}-v${fixture.mappingVersion}.json`
  if (!supported.length) {
    const ranges = [
      ...new Set(
        candidates.map(fixture => {
          const range = fixture.publisherSchemaRanges[plan.datasetCode]!
          return `${filename(fixture)}: ${range.min}–${range.max}`
        }),
      ),
    ]
    throw new Error(
      [
        `API-field compatibility preflight failed for ${plan.releaseCode}.`,
        `Dataset ${plan.datasetCode}, publisher schema ${sourceSchemaVersion}, API domain ${domain}.`,
        ranges.length
          ? `Reviewed mappings: ${ranges.join('; ')}.`
          : 'No publisher schema range is declared for this dataset in this API domain.',
        'Review the publisher schema changes before uploading. Extend the mapping range if retained paths, inputs and transformations are unchanged; otherwise add a new mapping version.',
        'Then rerun the upload. No compatibility range was changed automatically.',
      ].join('\n'),
    )
  }
  return { status: 'covered', mappings: [...new Set(supported.map(filename))] }
}
