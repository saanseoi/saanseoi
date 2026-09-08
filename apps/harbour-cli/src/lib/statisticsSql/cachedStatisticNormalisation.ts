import { join } from 'node:path'
import { populationThousandsRule } from '@repo/core/pipeline/services/statisticRules'
import { statisticFieldCurationRule } from './statisticFieldCurationRule'
import { statisticLocalisationRule } from './statisticLocalisationRule'
import { prepareCachedArtefact } from '../localPipeline/preparedArtefact.ts'
import { hashCanonicalStatisticPreparation } from './statisticPreparation.ts'
import {
  normaliseHkgovCenstatdStatistics,
  statisticNormalisationRule,
  type CanonicalStatsRows,
} from './normaliseHkgovCenstatdStatistics.ts'

/** Cache pure normalisation only; callers resolve live bridges and review metadata first. */
export async function normaliseCachedStatistics(
  directory: string,
  input: Parameters<typeof normaliseHkgovCenstatdStatistics>[0],
  options: Parameters<typeof normaliseHkgovCenstatdStatistics>[1] = {},
  normalise = normaliseHkgovCenstatdStatistics,
): Promise<CanonicalStatsRows> {
  // The fixed district cohort normalises in about 1 ms; persistent preparation
  // adds first-run I/O without a measured warm-run benefit at this size.
  if (input.length <= 18) return normalise(input, options)
  const identity = hashCanonicalStatisticPreparation({
    input,
    rules: [
      statisticNormalisationRule.declaration,
      populationThousandsRule.declaration,
      statisticFieldCurationRule.declaration,
      statisticLocalisationRule.declaration,
    ],
    fieldMetadata: [...(options.fieldMetadata ?? [])].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    measureMetadata: [...(options.measureMetadata ?? [])].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  })
  const entries = await prepareCachedArtefact<[string, unknown]>({
    directory: join(directory, identity),
    inputs: { contract: 'censtatd-canonical-normalisation-v1', identity },
    generate: async function* () {
      const canonical = normalise(input, options)
      for (const [section, rows] of Object.entries(canonical))
        for (const row of rows) yield [section, row]
    },
  })
  const canonical: CanonicalStatsRows = {
    dimensions: [],
    fields: [],
    fieldsI18n: [],
    measures: [],
    measuresI18n: [],
    observations: [],
    records: [],
    values: [],
    valuesI18n: [],
    auditGuards: [],
  }
  for (const entry of entries) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !Object.hasOwn(canonical, entry[0])
    )
      throw new Error('Invalid cached canonical Statistics section.')
    const section = canonical[entry[0] as keyof CanonicalStatsRows] as unknown[]
    section.push(entry[1])
  }
  return canonical
}
