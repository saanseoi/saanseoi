import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import declaration from '../../../../../../fixtures/meta/processing-rules/statistic-localisation.json'
import type { CenstatdFieldLocalisation } from './censtatdMeasureCurationTypes'

export const statisticLocalisationRule = registerRule(
  ruleDeclarationFromFixture(declaration),
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
