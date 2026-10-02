import {
  assertApiReleaseVersions,
  type ApiReleaseVersions,
} from '@repo/db/apiReleaseVersions'

// Publication supplies these pins; composition metadata only declares member slots.
const publications: Array<
  ApiReleaseVersions & {
    resourceType: string
    domainCode: string
    primaryVariant?: string
  }
> = [
  {
    resourceType: 'address',
    domainCode: 'saanseoi',
    primaryVariant: 'hkgov-dpo',
    schemaVersion: 'sv-address-v1',
    rulesetVersion: 'rs-address-merge-v1',
  },
  {
    resourceType: 'division',
    domainCode: 'geographic',
    primaryVariant: 'overture',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
  },
  {
    resourceType: 'division',
    domainCode: 'geographic',
    primaryVariant: 'saanseoi',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v2',
  },
  {
    resourceType: 'division',
    domainCode: 'hkgov-censtatd-hma',
    primaryVariant: 'hkgov-censtatd-hma',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-hkgov-censtatd-hma-merge-v1',
  },
  {
    resourceType: 'division',
    domainCode: 'hkgov-landsd',
    primaryVariant: 'hkgov-landsd',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-hkgov-landsd-merge-v1',
  },
  {
    resourceType: 'division',
    domainCode: 'hkgov-pland-pu',
    primaryVariant: 'hkgov-pland-pu',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-hkgov-pland-pu-merge-v1',
  },
  {
    resourceType: 'division',
    domainCode: 'hkgov-pland-new-town',
    primaryVariant: 'hkgov-pland-new-town',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-hkgov-pland-new-town-merge-v1',
  },
  {
    resourceType: 'place',
    domainCode: 'overture',
    primaryVariant: 'overture',
    schemaVersion: 'sv-place-v1',
    rulesetVersion: 'rs-place-merge-v1',
  },
  {
    resourceType: 'divisionStatistic',
    domainCode: 'government',
    schemaVersion: 'sv-statistics-v1',
    rulesetVersion: 'rs-division-statistic-merge-v1',
  },
  {
    resourceType: 'street',
    domainCode: 'saanseoi',
    primaryVariant: 'hkgov-landsd',
    schemaVersion: 'sv-street-v1',
    rulesetVersion: 'rs-street-merge-v1',
  },
]

export function releaseSetVersionsForPublication(
  resourceType: string,
  domainCode: string,
  primaryVariant: string,
): ApiReleaseVersions {
  const publication = publications.find(
    row =>
      row.resourceType === resourceType &&
      row.domainCode === domainCode &&
      (!row.primaryVariant || row.primaryVariant === primaryVariant),
  )
  if (!publication)
    throw new Error(
      `No explicit API release versions for ${domainCode}/${resourceType}/${primaryVariant}.`,
    )
  const { schemaVersion, rulesetVersion } = publication
  const versions = { schemaVersion, rulesetVersion }
  assertApiReleaseVersions(versions)
  return versions
}
