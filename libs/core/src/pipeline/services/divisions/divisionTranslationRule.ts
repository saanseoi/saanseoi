import ruleFixture from '../../../../../../fixtures/meta/processing-rules/assembly/division-translation.json'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import type { DivisionI18nPayload } from '@repo/db/currentSchema'
import { registerRule } from '../../../provenance/auditTypes'

export const divisionTranslationRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  (input: {
    source: DivisionI18nPayload[]
    localisations: Array<{ locale: string; name: string }>
    applications: Array<{
      locale: string
      provenance: 'human-translated' | 'ai-translated'
    }>
  }) => {
    const existing = new Set(input.source.map(row => row.locale))
    const divisionId = input.source[0]?.divisionId
    if (!divisionId) return input.source
    return [
      ...input.source,
      ...input.localisations.flatMap(localised =>
        localised.locale.toLowerCase() === 'zh-hans' ||
        existing.has(localised.locale) ||
        input.applications.find(a => a.locale === localised.locale)?.provenance !==
          'human-translated'
          ? []
          : [
              {
                divisionId,
                locale: localised.locale,
                name: localised.name,
                nameAlts: null,
                nameRules: null,
                nameVariant: [localised.name],
                meta: {
                  isLocaleInferred: false,
                  fields: {
                    name: {
                      origin:
                        input.applications.find(a => a.locale === localised.locale)
                          ?.provenance ?? 'ai-translated',
                    },
                  },
                },
              } satisfies DivisionI18nPayload,
            ],
      ),
    ]
  },
)
