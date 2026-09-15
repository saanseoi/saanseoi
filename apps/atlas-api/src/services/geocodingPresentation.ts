import type { GeocodingQuery } from '../schema/geocoding'
import type { createDivisionResolver } from './divisionGeocoding'

type Resolution = ReturnType<ReturnType<typeof createDivisionResolver>['resolve']>
type Identifier = { type: string; id: string }
type Relationship = { data: Identifier[]; meta?: { paths: Identifier[][] } }
type Resource = {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, Relationship>
  meta?: Record<string, unknown>
}
type Candidate = {
  id?: string
  type?: string
  addressId?: string
  rank?: number
  score?: number
  coordinates?: unknown
  coordinateRole?: string
  divisions?: Resolution | null
  attributes?: Record<string, unknown>
  match?: Record<string, unknown>
}
const reference = (id: string): Identifier => ({ type: 'divisions', id })
const categories = ['administrative', 'locality', 'hood', 'landform'] as const

/** JSON:API presentation is separate from evidence and branch resolution. */
export function presentGeocoding(
  body: { data: unknown; meta: Record<string, unknown> },
  query: GeocodingQuery,
) {
  const profile = query.profile
  const full = profile === 'full'
  const map = profile === 'map' || full || query.geometry !== undefined
  const included = new Map<string, Resource>()
  const release = body.meta.release as { apiReleaseSet: string }
  const candidates: Candidate[] = Array.isArray(body.data)
    ? body.data
    : [{ divisions: body.data as Resolution, coordinates: body.meta.coordinates }]
  const data = candidates.map((candidate, index): Resource => {
    const resolution = candidate.divisions
    const relationships: Record<string, Relationship> = {}
    if (resolution) {
      const members = new Map(resolution.memberships.map(member => [member.id, member]))
      // Each category keeps its own root-to-leaf order. A city is not placed
      // under an administrative district merely because both cover the point.
      for (const category of categories) {
        const sourcePaths =
          category === 'landform' ? resolution.landform.paths : resolution.alternatives
        const paths = [
          ...new Map(
            sourcePaths
              .map(path => path.filter(id => members.get(id)?.category === category))
              .filter(path => path.length)
              .map(path => [JSON.stringify(path), path]),
          ).values(),
        ]
        const ids = [...new Set(paths.flat())]
        if (!ids.length) continue
        relationships[category] = {
          data: ids.map(reference),
          ...(paths.length > 1
            ? { meta: { paths: paths.map(path => path.map(reference)) } }
            : {}),
        }
        for (const id of ids) {
          const member = members.get(id)!
          const names = Object.fromEntries(
            Object.entries(member.names).map(([locale, name]) => [
              locale,
              full ? name : { name: name.name },
            ]),
          )
          const attributes: Record<string, unknown> = {
            level: member.level,
            i18n: names,
          }
          if (profile !== 'compact')
            Object.assign(attributes, {
              class: member.class,
              category: member.category,
            })
          if (map && 'geometry' in member) attributes.geometry = member.geometry
          const key = `divisions:${id}`
          if (!included.has(key)) included.set(key, { ...reference(id), attributes })
        }
      }
      // Missing/disconnected ancestry must remain visible, even without a path.
      for (const member of resolution.memberships)
        if (
          !Object.values(relationships).some(relationship =>
            relationship.data.some(
              ref => ref.type === 'divisions' && ref.id === member.id,
            ),
          )
        ) {
          const group = member.category ?? 'unclassified'
          let relationship = relationships[group]
          if (!relationship) {
            relationship = { data: [] }
            relationships[group] = relationship
          }
          relationship.data.push(reference(member.id))
          included.set(`divisions:${member.id}`, {
            ...reference(member.id),
            attributes: {
              level: member.level,
              class: member.class,
              i18n: Object.fromEntries(
                Object.entries(member.names).map(([locale, value]) => [
                  locale,
                  { name: value.name },
                ]),
              ),
            },
          })
        }
    }
    if (candidate.type === 'addresses' && candidate.id) {
      relationships.address = { data: [{ type: 'addresses', id: candidate.id }] }
      const source = candidate.attributes ?? {}
      const attributes = Object.fromEntries(
        Object.entries(source).filter(
          ([key, value]) =>
            value != null &&
            (full ||
              ['i18n', 'granularity', ...(map ? ['geometry'] : [])].includes(key)),
        ),
      )
      if (!full && attributes.i18n)
        attributes.i18n = Object.fromEntries(
          Object.entries(
            attributes.i18n as Record<string, Record<string, unknown>>,
          ).map(([locale, value]) => [
            locale,
            Object.fromEntries(
              Object.entries(value).filter(
                ([key, value]) =>
                  value != null &&
                  (profile !== 'compact' || key === 'formattedAddress'),
              ),
            ),
          ]),
        )
      included.set(`addresses:${candidate.id}`, {
        type: 'addresses',
        id: candidate.id,
        attributes,
      })
    }
    const match =
      candidate.match ??
      (candidate.score !== undefined
        ? { type: 'forward-geocoding', score: candidate.score }
        : { type: 'reverse-geocoding' })
    const attributes: Record<string, unknown> = {
      status: resolution?.status ?? body.meta.resolution ?? 'resolved',
    }
    if (profile !== 'compact') {
      attributes.match = match
      attributes.rank = candidate.rank ?? index + 1
      const coordinates = candidate.coordinates ?? body.meta.coordinates
      if (coordinates) attributes.coordinates = coordinates
      if (candidate.coordinateRole) attributes.coordinateRole = candidate.coordinateRole
    }
    const candidateKey =
      candidate.id ??
      candidate.addressId ??
      JSON.stringify(candidate.coordinates ?? body.meta.coordinates)
    return {
      type: 'geocoding-results',
      id: `${release.apiReleaseSet}:${candidateKey}`,
      attributes,
      relationships,
      ...(resolution && (full || resolution.alternatives.length > 1)
        ? {
            meta: {
              ...(resolution.alternatives.length > 1
                ? {
                    alternatives: resolution.alternatives.map(path =>
                      Object.fromEntries(
                        categories.map(category => [
                          category,
                          path
                            .filter(
                              id =>
                                resolution.memberships.find(member => member.id === id)
                                  ?.category === category,
                            )
                            .map(reference),
                        ]),
                      ),
                    ),
                  }
                : {}),
              ...(full
                ? {
                    coverage: {
                      geometry: resolution.coverage.geometry,
                      missingAncestorIds: resolution.coverage.missingAncestorIds,
                    },
                    ambiguity: resolution.ambiguity,
                    evidence: resolution.memberships.map(member => ({
                      division: reference(member.id),
                      evidence: member.evidence,
                    })),
                    datasetCoverage: {
                      covered: resolution.coverage.covered,
                      total: resolution.coverage.total,
                    },
                  }
                : {}),
            },
          }
        : {}),
    }
  })
  const meta: Record<string, unknown> = {
    profile,
    direction: body.meta.direction,
    release: full ? body.meta.release : { apiReleaseSet: release.apiReleaseSet },
  }
  for (const key of ['resolution', 'total', 'truncated'])
    if (body.meta[key] !== undefined) meta[key] = body.meta[key]
  // Only retain a separate identity for an actually different companion release.
  for (const key of ['addressRelease', 'divisionRelease']) {
    const companion = body.meta[key] as { apiReleaseSet: string } | undefined
    if (companion && companion.apiReleaseSet !== release.apiReleaseSet)
      meta[key] = full ? companion : { apiReleaseSet: companion.apiReleaseSet }
  }
  if (
    body.meta.direction === 'reverse' &&
    candidates.some(candidate => candidate.type === 'addresses')
  )
    meta.maxDistance = query.maxDistance
  return {
    jsonapi: { version: '1.1' as const },
    data,
    included: [...included.values()],
    meta,
  }
}
