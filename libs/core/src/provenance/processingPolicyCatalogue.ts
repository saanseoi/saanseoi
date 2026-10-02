import { computeVersionHash } from '@repo/db'
import streetAssembly from '../../../../fixtures/meta/processing-rules/assembly/landsd-street-assembly.json'
import streetRuleset from '../../../../fixtures/meta/rulesetVersions/rs-street-assembly-v1.json'
import { resolveRuleFixtureCatalog } from './ruleFixture'
import {
  resolveProcessingReferences,
  type ProcessingRuleReference,
  type ProcessingRulesetFixture,
} from './processingPolicy'
import snapshotPolicies from '../../../../fixtures/meta/snapshotProcessingRules.json'
import d0 from '../../../../fixtures/meta/processing-rules/assembly/address-curation.json'
import d1 from '../../../../fixtures/meta/processing-rules/assembly/address-normalisation.json'
import d2 from '../../../../fixtures/meta/processing-rules/assembly/address-preparation.json'
import d3 from '../../../../fixtures/meta/processing-rules/ingestion/als-source-retention.json'
import d4 from '../../../../fixtures/meta/processing-rules/assembly/censtatd-district-identity.json'
import d5 from '../../../../fixtures/meta/processing-rules/ingestion/censtatd-generic-source-assertion.json'
import d6 from '../../../../fixtures/meta/processing-rules/assembly/censtatd-population-thousands-to-persons.json'
import d7 from '../../../../fixtures/meta/processing-rules/ingestion/censtatd-source-assertion.json'
import d8 from '../../../../fixtures/meta/processing-rules/assembly/curated-division-assembly.json'
import d9 from '../../../../fixtures/meta/processing-rules/assembly/division-area-geometry.json'
import d10 from '../../../../fixtures/meta/processing-rules/assembly/division-boundary-geometry.json'
import d11 from '../../../../fixtures/meta/processing-rules/assembly/division-classification.json'
import d12 from '../../../../fixtures/meta/processing-rules/assembly/division-geometry-exclusions.json'
import d13 from '../../../../fixtures/meta/processing-rules/assembly/division-normalisation.json'
import d14 from '../../../../fixtures/meta/processing-rules/assembly/division-translation-summary.json'
import d15 from '../../../../fixtures/meta/processing-rules/assembly/division-translation.json'
import d16 from '../../../../fixtures/meta/processing-rules/assembly/geographic-hierarchy-patch.json'
import d17 from '../../../../fixtures/meta/processing-rules/assembly/geography-identities.json'
import d18 from '../../../../fixtures/meta/processing-rules/assembly/landsd-settlement-selection.json'
import d19 from '../../../../fixtures/meta/processing-rules/ingestion/landsd-street-source-retention.json'
import d20 from '../../../../fixtures/meta/processing-rules/ingestion/native-source-import.json'
import d21 from '../../../../fixtures/meta/processing-rules/ingestion/overture-source-retention.json'
import d22 from '../../../../fixtures/meta/processing-rules/assembly/place-address-analysis.json'
import d23 from '../../../../fixtures/meta/processing-rules/assembly/place-country-selection.json'
import d24 from '../../../../fixtures/meta/processing-rules/assembly/place-normalisation.json'
import d25 from '../../../../fixtures/meta/processing-rules/assembly/place-reference-name.json'
import d26 from '../../../../fixtures/meta/processing-rules/assembly/planning-division-normalisation.json'
import d27 from '../../../../fixtures/meta/processing-rules/ingestion/protomaps-source-extraction.json'
import d28 from '../../../../fixtures/meta/processing-rules/ingestion/saanseoi-source-retention.json'
import d29 from '../../../../fixtures/meta/processing-rules/assembly/statistic-field-curation.json'
import d30 from '../../../../fixtures/meta/processing-rules/assembly/statistic-localisation.json'
import d31 from '../../../../fixtures/meta/processing-rules/assembly/statistic-normalisation.json'
import d32 from '../../../../fixtures/meta/processing-rules/assembly/wkb-geometry.json'
import r0 from '../../../../fixtures/meta/rulesetVersions/rs-address-assembly-v1.json'
import r1 from '../../../../fixtures/meta/rulesetVersions/rs-division-assembly-v1.json'
import r2 from '../../../../fixtures/meta/rulesetVersions/rs-divisionArea-assembly-v1.json'
import r3 from '../../../../fixtures/meta/rulesetVersions/rs-divisionBoundary-assembly-v1.json'
import r4 from '../../../../fixtures/meta/rulesetVersions/rs-divisionStatistic-assembly-v1.json'
import r5 from '../../../../fixtures/meta/rulesetVersions/rs-place-assembly-v1.json'
import r6 from '../../../../fixtures/meta/rulesetVersions/rs-source-ingestion-v1.json'

const definitions = resolveRuleFixtureCatalog({
  'landsd-street-assembly': streetAssembly,
  'address-curation': d0,
  'address-normalisation': d1,
  'address-preparation': d2,
  'als-source-retention': d3,
  'censtatd-district-identity': d4,
  'censtatd-generic-source-assertion': d5,
  'censtatd-population-thousands-to-persons': d6,
  'censtatd-source-assertion': d7,
  'curated-division-assembly': d8,
  'division-area-geometry': d9,
  'division-boundary-geometry': d10,
  'division-classification': d11,
  'division-geometry-exclusions': d12,
  'division-normalisation': d13,
  'division-translation-summary': d14,
  'division-translation': d15,
  'geographic-hierarchy-patch': d16,
  'geography-identities': d17,
  'landsd-settlement-selection': d18,
  'landsd-street-source-retention': d19,
  'native-source-import': d20,
  'overture-source-retention': d21,
  'place-address-analysis': d22,
  'place-country-selection': d23,
  'place-normalisation': d24,
  'place-reference-name': d25,
  'planning-division-normalisation': d26,
  'protomaps-source-extraction': d27,
  'saanseoi-source-retention': d28,
  'statistic-field-curation': d29,
  'statistic-localisation': d30,
  'statistic-normalisation': d31,
  'wkb-geometry': d32,
})
const rulesets = [
  streetRuleset,
  r0,
  r1,
  r2,
  r3,
  r4,
  r5,
  r6,
] as unknown as ProcessingRulesetFixture[]
for (const fixture of [...rulesets, snapshotPolicies]) {
  if (fixture.versionHash !== computeVersionHash(fixture))
    throw new Error('Processing policy fixture versionHash mismatch.')
}
const policySelections = new Set<string>()
for (const policy of snapshotPolicies.policies) {
  const key = `${policy.datasetCode}:${policy.resourceType}`
  if (policySelections.has(key))
    throw new Error(`Duplicate snapshot processing policy: ${key}.`)
  policySelections.add(key)
  resolveProcessingReferences(policy.processingRules, 'assembly', rulesets, definitions)
}

export function resolveIngestionProcessingRules(references: ProcessingRuleReference[]) {
  return resolveProcessingReferences(references, 'ingestion', rulesets, definitions)
}
export function resolveSnapshotProcessingRules(
  datasetCodes: string[],
  resourceType: string,
) {
  const references = snapshotPolicies.policies
    .filter(
      policy =>
        policy.resourceType === resourceType &&
        datasetCodes.includes(policy.datasetCode),
    )
    .flatMap(policy => policy.processingRules)
  const selected = new Map<string, Set<string>>()
  for (const reference of references) {
    const operations = selected.get(reference.rulesetVersion) ?? new Set<string>()
    for (const code of reference.operationCodes) operations.add(code)
    selected.set(reference.rulesetVersion, operations)
  }
  return resolveProcessingReferences(
    [...selected]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rulesetVersion, codes]) => ({
        rulesetVersion,
        operationCodes: [...codes].sort(),
      })),
    'assembly',
    rulesets,
    definitions,
  )
}
