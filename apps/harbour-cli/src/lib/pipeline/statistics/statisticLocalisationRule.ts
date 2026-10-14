import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import declaration from '../../../../../../fixtures/meta/processing-rules/assembly/statistic-localisation.json'
import type { CenstatdFieldLocalisation } from './censtatdMeasureCurationTypes'

export const statisticLocalisationRule = registerRule(
  ruleDeclarationFromFixture(declaration),
  (
    localisation: Pick<
      CenstatdFieldLocalisation,
      'locale' | 'name' | 'isTranslationVerified' | 'origin'
    > & { description: string | null },
  ) => ({
    locale: localisation.locale,
    name: localisation.name,
    description: localisation.description,
    meta: {
      isLocaleInferred: false,
      ...(localisation.origin
        ? {
            fields: Object.fromEntries(
              ['name', ...(localisation.description ? ['description'] : [])].map(
                field => [
                  field,
                  {
                    origin:
                      localisation.origin?.kind === 'machine-translated'
                        ? ('ai-translated' as const)
                        : localisation.origin?.kind === 'human-translated'
                          ? ('human-translated' as const)
                          : ('provided' as const),
                    ...(localisation.origin?.kind === 'publisher'
                      ? {}
                      : { isHumanVerified: localisation.isTranslationVerified }),
                  },
                ],
              ),
            ),
          }
        : {}),
    },
  }),
)
