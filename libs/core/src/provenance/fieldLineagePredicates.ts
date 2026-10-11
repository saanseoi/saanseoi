import { computeVersionHash, type FieldLineageDefinition } from '@repo/db'
import type { DefinitionRef } from '../../../db/src/fieldLineageTypes'
import evidence from '../../../../fixtures/meta/fieldLineage/implementation-evidence.json'
import { normaliseDivisionI18n } from '../pipeline/services/divisions/division'

type NameChange = {
  name?: string
  remove?: boolean
  aliases?: string[]
  removeAliases?: string[]
}
type DecisionEntry = {
  divisionId: string
  names?: Record<string, NameChange>
  replacement?: { nameEn?: string; nameAltsEn?: string[]; nameAltsZhHant?: string[] }
}
type PredicateDocument = {
  locale?: string
  output?: string
  localeField?: string
  document?: string
  implementation?: { path: string; symbol: string }
  implementationEvidence?: unknown
  rules?: Array<{ locale: string; suffix: string }>
}

/** Evaluate retained Division applicability without writing per-record automatic audit traces. */
export function divisionFieldLineagePredicate(
  definition: FieldLineageDefinition,
  ref: DefinitionRef,
  inputs: Record<string, unknown>,
): boolean {
  const document = definition.definitions[ref.definitionId] as
    | PredicateDocument
    | undefined
  if (
    !document ||
    computeVersionHash(document) !== ref.definitionId ||
    ref.branchId !== 'applicability'
  )
    throw new Error('Missing or invalid retained Division predicate.')
  const read = (hash: string | undefined) => {
    const value = hash
      ? (definition.definitions[hash] as { entries: DecisionEntry[] } | undefined)
      : undefined
    if (!value || !Array.isArray(value.entries) || computeVersionHash(value) !== hash)
      throw new Error('Missing retained Division decision document.')
    return value
  }
  const locale = document.locale === '*' ? inputs.locale : document.locale
  if (typeof locale !== 'string' || !locale || typeof inputs.recordId !== 'string')
    throw new Error('Division predicate requires record identity and selected locale.')
  switch (ref.operationCode) {
    case 'division-name-alias-rule': {
      const implementation = document.implementation as { path: string; symbol: string }
      const current = (evidence.implementations as Record<string, unknown>)[
        `${implementation.path}#${implementation.symbol}`
      ]
      if (
        !current ||
        computeVersionHash(current) !==
          computeVersionHash(document.implementationEvidence)
      )
        throw new Error(
          'Retained alias predicate does not match the current implementation.',
        )
      if (!Object.hasOwn(inputs, 'publisherNames'))
        throw new Error('Missing publisher names for alias applicability.')
      const row = normaliseDivisionI18n(inputs.recordId, inputs.publisherNames).find(
        row => row.locale === locale,
      )
      if (!Array.isArray(document.rules))
        throw new Error('Missing retained alias conditions.')
      return document.rules.some(
        (rule: { locale: string; suffix: string }) =>
          rule.locale === locale && row?.name?.endsWith(rule.suffix),
      )
    }
    case 'division-field-curation': {
      const entry = read(document.document).entries.find(
        (entry: { divisionId: string }) => entry.divisionId === inputs.recordId,
      )
      const change = entry?.names?.[locale]
      if (!change) return false
      return document.output === 'name'
        ? Boolean(change.name || change.remove)
        : Boolean(
            change.name ||
              change.remove ||
              change.aliases?.length ||
              change.removeAliases?.length,
          )
    }
    case 'division-field-patch': {
      const entry = read(document.document).entries.find(
        (entry: { divisionId: string }) => entry.divisionId === inputs.recordId,
      )
      const replacement = entry?.replacement
      if (!replacement || document.localeField === 'nameRules') return false
      if (locale === 'en')
        return document.localeField === 'name'
          ? Boolean(replacement.nameEn)
          : Boolean(replacement.nameEn || replacement.nameAltsEn)
      return (
        locale === 'zh-hant' &&
        document.localeField !== 'name' &&
        Boolean(replacement.nameAltsZhHant)
      )
    }
    default:
      throw new Error(`Unsupported retained Division predicate: ${ref.operationCode}`)
  }
}
