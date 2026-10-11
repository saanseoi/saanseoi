import { geographicDivisionClassification } from '@repo/db'
import { divisionCuration } from './curationInventory'
const aliasCuration = divisionCuration.names
const overrides = { entries: divisionCuration.matches.entries }
type CuratedName = {
  divisionId: string
  locale: string
  name: string | null
  nameAlts: string | null
  nameVariant: string[] | null
  nameRules: Array<{ value: string; variant: string | null }> | null
  isLocaleInferred: boolean
}

const classes = new Map([
  ...divisionCuration.additions.entries.map(row => [row.id, row.class] as const),
  ...divisionCuration.classifications.entries.map(
    row => [row.divisionId, row.class] as const,
  ),
])
export const curatedDivisionPolicy = {
  classes: Object.fromEntries(classes),
  overrides,
  aliases: aliasCuration,
}

/** Publisher taxonomy is evidence, never a constraint on a curated identity. */
export function curatedDivisionClassification(id: string) {
  const classification = classes.get(id)
  if (!classification) return null
  return { class: classification, ...geographicDivisionClassification(classification)! }
}

type NameOverride = {
  remove?: boolean
  name?: string
  aliases?: string[]
  removeAliases?: string[]
}

export function applyCuratedDivisionNames(id: string, names: CuratedName[]) {
  const result = structuredClone(names)
  const changes: Record<string, NameOverride> = {}
  const aliasPatch = aliasCuration.entries.find(entry => entry.divisionId === id)
  for (const [locale, change] of Object.entries(aliasPatch?.names ?? {}))
    if (change) changes[locale] = { ...changes[locale], ...structuredClone(change) }
  for (const row of names) {
    const aliases = aliasCuration.nameAliasRules.flatMap(rule =>
      row.locale === rule.locale && row.name?.endsWith(rule.suffix)
        ? [row.name.slice(0, -rule.suffix.length) + rule.replacement]
        : [],
    )
    if (aliases.length) {
      const change = changes[row.locale] ?? {}
      changes[row.locale] = {
        ...change,
        aliases: [...(change.aliases ?? []), ...aliases],
      }
    }
  }
  for (const [locale, change] of Object.entries(changes) as [string, NameOverride][]) {
    if (change.remove) {
      for (let index = result.length - 1; index >= 0; index--)
        if (result[index]!.locale === locale) result.splice(index, 1)
      continue
    }
    let row = result.find(name => name.locale === locale)
    if (!row) {
      if (!change.name) continue
      row = {
        divisionId: id,
        locale,
        name: change.name,
        nameAlts: null,
        nameVariant: null,
        nameRules: null,
        isLocaleInferred: false,
      }
      result.push(row)
    }
    if (change.name) row.name = change.name
    const removed = new Set(change.removeAliases ?? [])
    const keep = (value: string) => !removed.has(value)
    const aliases = [
      ...new Set([...(row.nameAlts?.split('|') ?? []), ...(change.aliases ?? [])]),
    ].filter(value => value && value !== row.name && keep(value))
    row.nameAlts = aliases.length ? aliases.join('|') : null
    row.nameVariant = [
      ...new Set([
        ...(row.nameVariant ?? []),
        ...(row.name ? [row.name] : []),
        ...aliases,
      ]),
    ].filter(keep)
    const rules = row.nameRules?.filter(rule => keep(rule.value)) ?? []
    for (const value of change.aliases ?? [])
      if (
        value !== row.name &&
        keep(value) &&
        !rules.some(rule => rule.value === value)
      )
        rules.push({ value, variant: 'alternate' })
    row.nameRules = rules.length ? rules : null
  }
  return result
}
