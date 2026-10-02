import addressSchema from '../../../fixtures/meta/schemaVersions/sv-address-v1.json'
import divisionSchema from '../../../fixtures/meta/schemaVersions/sv-division-v1.json'
import placeSchema from '../../../fixtures/meta/schemaVersions/sv-place-v1.json'
import statisticsSchema from '../../../fixtures/meta/schemaVersions/sv-statistics-v1.json'
import streetSchema from '../../../fixtures/meta/schemaVersions/sv-street-v1.json'
import addressRules from '../../../fixtures/meta/rulesetVersions/rs-address-merge-v1.json'
import divisionRules from '../../../fixtures/meta/rulesetVersions/rs-division-merge-v1.json'
import curatedDivisionRules from '../../../fixtures/meta/rulesetVersions/rs-division-merge-v2.json'
import hmaRules from '../../../fixtures/meta/rulesetVersions/rs-division-hkgov-censtatd-hma-merge-v1.json'
import landsdRules from '../../../fixtures/meta/rulesetVersions/rs-division-hkgov-landsd-merge-v1.json'
import planningUnitRules from '../../../fixtures/meta/rulesetVersions/rs-division-hkgov-pland-pu-merge-v1.json'
import newTownRules from '../../../fixtures/meta/rulesetVersions/rs-division-hkgov-pland-new-town-merge-v1.json'
import placeRules from '../../../fixtures/meta/rulesetVersions/rs-place-merge-v1.json'
import statisticsRules from '../../../fixtures/meta/rulesetVersions/rs-division-statistic-merge-v1.json'
import streetRules from '../../../fixtures/meta/rulesetVersions/rs-street-merge-v1.json'
import type { ApiFamilyType } from './constants/schema'
import { computeVersionHash } from './versioning'

export type ApiReleaseVersions = {
  schemaVersion: string
  rulesetVersion: string
}

// Static imports keep the publication catalogue available inside Workers.
export const apiReleaseSchemas = [
  addressSchema,
  divisionSchema,
  placeSchema,
  statisticsSchema,
  streetSchema,
]
export const apiReleaseRulesets = [
  addressRules,
  divisionRules,
  curatedDivisionRules,
  hmaRules,
  landsdRules,
  planningUnitRules,
  newTownRules,
  placeRules,
  statisticsRules,
  streetRules,
]

const resourcesByFamily: Record<ApiFamilyType, string> = {
  addresses: 'address',
  divisions: 'division',
  places: 'place',
  stats: 'divisionStatistic',
  streets: 'street',
}

/** Reject absent, unknown or incompatible pins before creating or publishing a release. */
export function assertApiReleaseVersions(
  versions: ApiReleaseVersions,
  family?: ApiFamilyType,
) {
  if (!versions?.schemaVersion || !versions?.rulesetVersion)
    throw new Error(
      'API release publication requires explicit schemaVersion and rulesetVersion.',
    )
  const schema = apiReleaseSchemas.find(row => row.code === versions.schemaVersion)
  const ruleset = apiReleaseRulesets.find(row => row.code === versions.rulesetVersion)
  if (!schema)
    throw new Error(`Unknown API release schemaVersion: ${versions.schemaVersion}`)
  if (!ruleset)
    throw new Error(`Unknown API release rulesetVersion: ${versions.rulesetVersion}`)
  for (const descriptor of [schema, ruleset])
    if (descriptor.versionHash !== computeVersionHash(descriptor))
      throw new Error(
        `API release descriptor hash does not match its contents: ${descriptor.code}`,
      )
  if (
    schema.resourceType !== ruleset.resourceType ||
    (family && schema.resourceType !== resourcesByFamily[family])
  )
    throw new Error(
      `Incompatible API release versions: ${schema.code}, ${ruleset.code}${family ? ` for ${family}` : ''}`,
    )
}
