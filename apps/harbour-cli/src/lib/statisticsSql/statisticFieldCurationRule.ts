import { registerRule } from '@repo/core/provenance'
import type { CenstatdFieldMetadata } from './censtatdMeasureCurationTypes'

export const statisticFieldCurationRule = registerRule(
  {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'curate-statistic-fields',
    scope: 'bulk',
    basis: 'fixture',
    summary:
      'Select reviewed field names, dimensions, units, aggregations and localisations by dataset and publisher field key.',
    inputs: ['statistic-field-curations'],
    outputs: ['statsFields'],
    parameters: {},
    implementation: {
      path: 'apps/harbour-cli/src/lib/statisticsSql/statisticFieldCurationRule.ts',
      symbol: 'statisticFieldCurationRule',
    },
  },
  (input: {
    metadata?: ReadonlyMap<string, CenstatdFieldMetadata>
    datasetCode: string
    sourceField: string
  }) => input.metadata?.get(`${input.datasetCode}\u0000${input.sourceField}`),
)
