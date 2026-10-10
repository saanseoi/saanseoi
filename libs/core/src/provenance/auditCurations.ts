import { organiseCurationReview } from './auditCurationReview'
import type { Json } from './types'
const object = (value: Json | undefined): Record<string, Json> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
export function curationNames(value: Json | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (Array.isArray(value)) {
    if (value.every(entry => typeof entry === 'string'))
      return { und: value.join(' / ') }
    for (const entry of value) {
      const row = object(entry)
      if (typeof row.locale === 'string' && typeof row.name === 'string')
        result[row.locale] = row.name
    }
  } else {
    for (const [locale, entry] of Object.entries(object(value))) {
      const name = typeof entry === 'string' ? entry : object(entry).name
      if (typeof name === 'string') result[locale] = name
    }
  }
  return result
}
/** Historical wording is omitted in the reader; the retained evidence stays intact. */
export function cleanCurationWording(value: Json): Json {
  if (typeof value === 'string')
    return value
      .replace(/; geometry awaits local review\./g, '.')
      .replace(/ and (?:its boundary|geometry) awaits local review\./g, '.')
  if (Array.isArray(value)) return value.map(cleanCurationWording)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cleanCurationWording(child)]),
    )
  return value
}
/** Join names only from evidence retained by this same preparation run. */
export function enrichCurationGroups(
  groups: Record<string, Json>,
  release?: string,
): Record<string, Json> {
  const curations = object(groups['curation-definitions'])
  if (!Array.isArray(curations.entries)) return groups
  const boundarySources = new Map(
    curations.entries
      .map(object)
      .filter(row => row.section === 'selections' && row.collection === 'entries')
      .map(row => {
        const definition = object(row.definition)
        return [definition.divisionId, definition.sourceRecordId] as const
      }),
  )
  const index = new Map<string, Record<string, string>>()
  const add = (id: Json | undefined, names: Json | undefined) => {
    if (typeof id !== 'string') return
    const values = curationNames(names)
    if (Object.keys(values).length) index.set(id, { ...index.get(id), ...values })
  }
  const nameRows = object(groups['curation-record-names']).entries
  const aliasResults = object(groups['name-alias-results']).entries
  if (Array.isArray(nameRows))
    for (const entry of nameRows) {
      const row = object(entry)
      add(row.id, row.names)
    }
  for (const entry of curations.entries) {
    const row = object(object(entry).definition)
    add(row.id ?? row.divisionId, row.names)
    add(row.reviewId, row.names)
    add(row.divisionId, object(object(row.review).before).names)
    add(row.divisionId, object(object(row.review).proposed).names)
  }
  const changes = object(groups['prepared-division-changes']).entries
  if (Array.isArray(changes))
    for (const entry of changes) {
      const row = object(entry)
      const names = object(row.names)
      add(row.id, names.before)
      add(row.id, names.after)
      // Preserve source aliases so source-specific curations can use canonical names.
      let identifiers = object(object(row.fields).identifiers).after
      if (typeof identifiers === 'string') {
        try {
          identifiers = JSON.parse(identifiers)
        } catch {}
      }
      const ids = object(identifiers)
      const landsd = object(ids.landsd).geonameId ?? ids['LANDSD:GEO_NAME_ID']
      if (landsd !== undefined) add(`LANDSD:PLACE_NAME:${landsd}`, names.after)
      add(object(ids.overture).divisionId, names.after)
    }
  // Boundary instructions use source IDs; resolve them through this run's identity matches.
  for (const entry of curations.entries) {
    const row = object(entry)
    const definition = object(row.definition)
    if (
      row.section !== 'matches' ||
      row.collection !== 'islands' ||
      typeof definition.id !== 'string'
    )
      continue
    for (const match of Array.isArray(definition.matches) ? definition.matches : []) {
      const id = object(match).id
      if (typeof id === 'string') add(definition.id, index.get(id))
    }
  }
  // Source tags provide a label when no canonical identity label is retained.
  for (const entry of curations.entries) {
    const row = object(entry)
    const definition = object(row.definition)
    if (
      row.section !== 'selections' ||
      row.collection !== 'entries' ||
      typeof definition.divisionId !== 'string' ||
      index.has(definition.divisionId)
    )
      continue
    const selected = (Array.isArray(definition.options) ? definition.options : [])
      .map(object)
      .find(option => option.sourceRecordId === definition.sourceRecordId)
    const tags = object(selected?.sourceTags)
    add(definition.divisionId, {
      en: tags['name:en'] ?? null,
      'zh-hant': tags['name:zh'] ?? null,
      und: tags.name ?? null,
    })
  }
  const updates = object(groups['reviewed-updates']).entries
  if (Array.isArray(updates))
    for (const entry of updates) {
      const row = object(entry)
      add(row.divisionId, object(row.before).names)
      add(row.divisionId, object(row.proposed).names)
      if (typeof row.divisionId === 'string')
        add(row.fingerprint, index.get(row.divisionId))
    }
  const organised = organiseCurationReview(
    curations.entries,
    Array.isArray(updates) ? updates : [],
    release,
  )
  const {
    'curation-record-names': _names,
    'name-alias-results': _aliases,
    'boundary-patch-results': _boundaryPatches,
    'reviewed-updates': _updates,
    'preprocessing-context': _context,
    ...visibleGroups
  } = groups
  const contexts = object(groups['preprocessing-context']).entries
  const byId = new Map(
    (Array.isArray(contexts) ? contexts : []).map(value => [
      object(value).id,
      object(value),
    ]),
  )
  const prepared = object(visibleGroups['prepared-division-changes'])
  if (Array.isArray(prepared.entries))
    visibleGroups['prepared-division-changes'] = {
      ...prepared,
      entries: prepared.entries.map(value => {
        const row = object(value)
        const context = byId.get(row.id)
        if (!context) return row
        const fields = object(row.fields)
        return {
          ...row,
          ...context,
          fields: {
            ...fields,
            ...('publisherHierarchy' in context && 'after' in object(fields.hierarchies)
              ? {
                  hierarchies: {
                    ...object(fields.hierarchies),
                    before: context.publisherHierarchy,
                  },
                }
              : {}),
          },
        }
      }),
    }
  return {
    ...visibleGroups,
    'curation-definitions': {
      ...curations,
      updatePolicy: object(object(curations.metadata).updatePolicy),
      outcomes: organised.outcomes,
      outcomeRecords: organised.outcomeRecords,
      entries: organised.entries.map(entry => {
        const row = object(entry)
        const definition = object(row.definition)
        const feature = object(definition.feature)
        const id =
          definition.divisionId ??
          object(definition.properties).divisionId ??
          object(feature.properties).divisionId ??
          definition.canonicalId ??
          definition.fingerprint ??
          definition.id
        const canonicalNames = typeof id === 'string' ? index.get(id) : undefined
        const displayDefinition = { ...definition }
        if (row.section === 'exclusions' && row.collection === 'islandDecisions') {
          displayDefinition.selectedSourceRecordId =
            boundarySources.get(definition.id) ?? null
        }

        if (
          row.section === 'matches' &&
          row.collection === 'entries' &&
          displayDefinition.geometryReview === 'draw-required'
        )
          delete displayDefinition.geometryReview
        return {
          ...row,
          definition: cleanCurationWording(displayDefinition),
          ...(canonicalNames ? { canonicalNames } : {}),
          ...(row.section === 'selections' && row.collection === 'corrections'
            ? {
                boundaryPatch:
                  (Array.isArray(object(groups['boundary-patch-results']).entries)
                    ? (object(groups['boundary-patch-results']).entries as Json[])
                    : []
                  ).find(patch => object(patch).id === definition.id) ?? null,
              }
            : {}),
          ...(row.section === 'names' &&
          row.collection === 'nameAliasRules' &&
          Array.isArray(aliasResults)
            ? {
                ruleEvidenceBasis:
                  object(groups['name-alias-results']).evidenceBasis ?? null,
                ruleResult:
                  aliasResults.find(value => {
                    const result = object(value)
                    return (
                      result.locale === definition.locale &&
                      result.suffix === definition.suffix &&
                      result.replacement === definition.replacement
                    )
                  }) ?? null,
              }
            : {}),
          ...(row.section === 'islandGroups'
            ? {
                memberNames: Object.fromEntries(
                  ['seedMemberIds', 'include', 'exclude'].map(key => [
                    key,
                    Array.isArray(definition[key])
                      ? definition[key].map(id => ({
                          id,
                          names: typeof id === 'string' ? (index.get(id) ?? {}) : {},
                        }))
                      : [],
                  ]),
                ),
              }
            : {}),
          ...(Array.isArray(definition.paths)
            ? {
                pathNames: definition.paths.map(path =>
                  Array.isArray(path)
                    ? path.map(id => ({
                        id,
                        names: typeof id === 'string' ? (index.get(id) ?? {}) : {},
                      }))
                    : path,
                ),
              }
            : {}),
        }
      }),
    },
  }
}
