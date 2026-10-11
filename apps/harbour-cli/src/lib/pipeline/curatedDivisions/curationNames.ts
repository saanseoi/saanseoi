import { buildDeterministicUuidV5, canonicalGeneratedId } from '@repo/db'
import { sourceDivisionNames } from '@repo/core/pipeline/services/divisions/curationInventory'
import { landsdPlaceNameLocales } from '@repo/core/pipeline/services/sources/landsdPlaceNames'

type Row = Record<string, any>
/** Retain labels from the pinned ingredients, including identities excluded from output. */
export function preparationCurationNames(input: {
  overture: Row[]
  landsd: Row[]
  protomaps: Row[]
  definitions: Row
  names: Row[]
  aliases?: Record<string, string>
}) {
  const names: Record<string, Record<string, string>> = {}
  const add = (id: string, values: Record<string, unknown>) => {
    for (const [locale, value] of Object.entries(values))
      if (typeof value === 'string' && value && value !== id) {
        names[id] ??= {}
        names[id][locale] = value
      }
  }
  for (const row of input.overture) add(row.id, sourceDivisionNames(row))
  for (const row of input.landsd) {
    const locales = landsdPlaceNameLocales(row.placeNames)
    add(
      `LANDSD:PLACE_NAME:${row.id}`,
      Object.fromEntries(
        Object.entries(locales).map(([locale, value]) => [locale, value?.official]),
      ),
    )
  }
  const shapes = new Map(input.protomaps.map(row => [row.sourceRecordId, row]))
  for (const row of input.definitions.selections?.entries ?? []) {
    const properties = shapes.get(row.sourceRecordId)?.properties ?? {}
    add(row.divisionId, {
      en: properties.names?.en ?? properties.tags?.['name:en'] ?? properties.tags?.name,
      'zh-hant':
        properties.names?.['zh-Hant'] ??
        properties.names?.zh ??
        properties.tags?.['name:zh'],
    })
  }
  for (const row of input.definitions.additions?.entries ?? [])
    add(row.id, row.names ?? {})
  for (const row of input.names) add(row.divisionId, { [row.locale]: row.name })
  for (const row of input.definitions.matches?.islands ?? []) {
    const generated = canonicalGeneratedId(
      buildDeterministicUuidV5('7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7', row.id),
    )
    add(row.id, names[generated] ?? {})
    for (const match of row.matches ?? []) add(row.id, names[match.id] ?? {})
  }
  for (const [alias, canonical] of Object.entries(input.aliases ?? {}))
    add(alias, names[canonical] ?? {})
  return Object.entries(names).map(([id, names]) => ({ id, names }))
}
