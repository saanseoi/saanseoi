import { registerRule } from '@repo/core/provenance'
import type { CenstatdFieldLocalisation } from './censtatdMeasureCurationTypes'

export const statisticLocalisationRule = registerRule(
  {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'apply-statistic-localisation',
    scope: 'individual',
    basis: 'fixture',
    summary:
      'Apply a reviewed field or measure localisation, preserving its translation verification flag.',
    inputs: ['statistic-localisation-curations'],
    outputs: ['statsFieldsI18n', 'statsMeasuresI18n'],
    parameters: {},
    implementation: {
      path: 'apps/harbour-cli/src/lib/statisticsSql/statisticLocalisationRule.ts',
      symbol: 'statisticLocalisationRule',
    },
  },
  (
    localisation: Pick<
      CenstatdFieldLocalisation,
      'locale' | 'name' | 'isTranslationVerified'
    > & { description: string | null },
  ) => ({
    locale: localisation.locale,
    name: localisation.name,
    description: localisation.description,
    isTranslationVerified: localisation.isTranslationVerified,
  }),
)
