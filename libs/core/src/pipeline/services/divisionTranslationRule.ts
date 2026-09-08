import type { DivisionI18nPayload } from '@repo/db/currentSchema'
import { registerRule } from '../../provenance/auditTypes'

export const divisionTranslationRule = registerRule(
  {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'apply-division-name-translation',
    scope: 'individual',
    basis: 'fixture',
    summary:
      'Add a selected translated division name only for a missing locale, preserving the recorded translation origin.',
    inputs: ['division-i18n', 'division-translations'],
    outputs: ['division-i18n'],
    parameters: {},
    implementation: {
      path: 'libs/core/src/pipeline/services/divisionTranslationRule.ts',
      symbol: 'divisionTranslationRule',
    },
  },
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
        existing.has(localised.locale)
          ? []
          : [
              {
                divisionId,
                isLocaleInferred: false,
                locale: localised.locale,
                name: localised.name,
                nameAlts: null,
                nameProvenance:
                  input.applications.find(a => a.locale === localised.locale)
                    ?.provenance ?? 'ai-translated',
                nameRules: null,
                nameVariant: [localised.name],
              } satisfies DivisionI18nPayload,
            ],
      ),
    ]
  },
)
