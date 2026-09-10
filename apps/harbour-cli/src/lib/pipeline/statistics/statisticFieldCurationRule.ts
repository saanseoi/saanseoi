import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import declaration from '../../../../../../fixtures/meta/processing-rules/statistic-field-curation.json'
import type { CenstatdFieldMetadata } from './censtatdMeasureCurationTypes'

export const statisticFieldCurationRule = registerRule(
  ruleDeclarationFromFixture(declaration),
  (input: {
    metadata?: ReadonlyMap<string, CenstatdFieldMetadata>
    datasetCode: string
    sourceField: string
  }) => input.metadata?.get(`${input.datasetCode}\u0000${input.sourceField}`),
)
