import { divisionIdentifiersWithWikidata } from '@repo/core/pipeline/services/sources/divisionIdentifiers.ts'
import { readSourceAttributions } from '@repo/core/pipeline/services/sources/sourceAttribution'
import type { SourceAttribution } from '@repo/db'
import geographicCodes from '../../../../../../fixtures/meta/divisionCodes/geographic.json'

/** Group canonical upstream attribution for the internal assembly evidence workspace. */
export function groupCuratedUpstreamAttribution(value: unknown) {
  const grouped: Record<string, SourceAttribution[]> = {}
  for (const source of readSourceAttributions(value)) {
    const sources = grouped[source.publisher] ?? []
    sources.push({ ...source })
    grouped[source.publisher] = sources
  }
  return grouped
}

const object = (value: any) => (typeof value === 'string' ? JSON.parse(value) : value)

import { divisionCartography } from '@repo/db'

export { divisionCartography } from '@repo/db'

export function curatedNameObject(value: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      if (raw == null) return []
      const decoded = ['nameVariant', 'nameRules'].includes(key) ? object(raw) : raw
      return decoded == null ? [] : [[key, decoded]]
    }),
  )
}

export function applyCuratedRecordContract(rows: Record<string, any>[]) {
  for (const row of rows) {
    row.divisionCode ??= null
    const policy = divisionCartography[row.class as keyof typeof divisionCartography]
    if (!policy) throw Error(`Missing cartography policy for ${row.class}`)
    row.cartography = { minZoom: policy[0], maxZoom: policy[2], prominence: policy[1] }
    const identifiers =
      divisionIdentifiersWithWikidata(row.identifiers, row.wikidata) ?? {}
    delete row.wikidata
    const assignment = geographicCodes.assignments.find(
      code => code.canonicalId === row.id,
    )
    if (assignment && assignment.divisionClass !== row.class)
      throw Error(`Division code class mismatch: ${row.id}`)
    if (assignment && assignment.divisionCategory !== row.category)
      throw Error(`Division code category mismatch: ${row.id}`)
    row.divisionCode = assignment?.divisionCode ?? row.divisionCode
    row.identifiers = identifiers
    const sources = object(row.sources) ?? {}
    for (const [publisher, values] of Object.entries(sources)) {
      sources[publisher] = (values as any[]).flatMap(source => {
        const contributions = source.contributions?.filter(
          (value: string) => value !== 'membership',
        )
        if (source.contributions && !contributions.length) return []
        return [{ ...source, ...(contributions ? { contributions } : {}) }]
      })
      if (!sources[publisher].length) delete sources[publisher]
    }
    if (!sources.overture) {
      sources.saanseoi = [
        {
          dataset: 'ds-hk-saanseoi-division',
          recordId: row.id,
          contributions: ['identity', 'names', 'classification', 'hierarchy'],
          curation: identifiers.saanseoi?.sourceId
            ? 'division-identity-matches'
            : 'division-additions',
        },
      ]
    }
    if (assignment)
      sources.saanseoi = [
        ...(sources.saanseoi ?? []),
        {
          dataset: 'ds-hk-saanseoi-division',
          recordId: row.id,
          curation: 'division-codes/geographic',
          contributions: ['divisionCode'],
        },
      ]
    row.sources = sources
  }
}

export function applyCuratedAreaContract(rows: Record<string, any>[]) {
  for (const row of rows) {
    const sources = object(row.sources) ?? {}
    if (sources.saanseoi)
      sources.saanseoi = sources.saanseoi.map((source: any) => ({
        ...source,
        dataset: 'ds-hk-saanseoi-division',
        curation: source.curation ?? source.dataset,
        contributions: source.contributions ?? ['geometry'],
      }))
    row.sources = sources
  }
}
