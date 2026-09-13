import { z } from '@hono/zod-openapi'
import {
  DivisionChangesError,
  resolveDivisionChangesRelease,
} from '../db/divisionChanges'
import { PublicationReadUnavailableError } from '../db/publicationState'
import type { DivisionRecord } from '../db/divisions'
import type {
  DivisionChangedField,
  DivisionChangesQuery,
  DivisionChangesResponse,
} from '../schema/divisionChanges'
import {
  loadGeocodingDivisions,
  type GeocodingDatabases,
  type GeocodingRelease,
} from './geocodingData'

export type DivisionChangesDependencies = {
  resolveRelease: typeof resolveDivisionChangesRelease
  loadDefinitions: typeof loadGeocodingDivisions
}
type Definitions = Awaited<ReturnType<typeof loadGeocodingDivisions>>
const membershipFields = new Set<DivisionChangedField>([
  'membershipGeometry',
  'hierarchies',
  'category',
  'class',
  'level',
])

/** Object order is immaterial; ancestry and coordinate order remain significant. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}
async function hash(value: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(value)),
  )
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
function sortedSet<T>(values: T[]) {
  return [...new Map(values.map(value => [canonical(value), value])).entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, value]) => value)
}
function attributes(record: DivisionRecord) {
  const { snapshotId, id, createdAt, updatedAt, hierarchies, ...content } =
    record.division
  return {
    ...content,
    divisionCode: content.divisionCode ?? null,
    identifiers: content.identifiers ?? null,
    // Alternative branches are a set; entries within each branch are ordered.
    hierarchies: Object.fromEntries(
      Object.entries(hierarchies).map(([category, paths]) => [
        category,
        sortedSet(
          paths.map(path => path.map(({ id, class: klass }) => ({ id, class: klass }))),
        ),
      ]),
    ),
    hierarchyNames: Object.fromEntries(
      Object.entries(hierarchies).map(([category, paths]) => [
        category,
        sortedSet(paths.map(path => path.map(({ id, name }) => ({ id, name })))),
      ]),
    ),
    names: record.i18n,
  }
}
async function definitions(data: Definitions) {
  const areas = new Map<string, Array<{ geometry: unknown }>>()
  for (const area of data.areas) {
    // Match the authoritative association used by the geocoder, never label points.
    if (area.variant !== 'stub') continue
    const geometry = area.geometry as { type?: string } | null
    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') continue
    const items = areas.get(area.divisionId) ?? []
    items.push({ geometry: area.geometry })
    areas.set(area.divisionId, items)
  }
  const entries = await Promise.all(
    data.records.map(async record => {
      const content = {
        ...attributes(record),
        membershipGeometry: sortedSet(areas.get(record.division.id) ?? []),
      }
      return [record.division.id, { content, hash: await hash(content) }] as const
    }),
  )
  return new Map(entries.sort(([a], [b]) => compare(a, b)))
}
type DefinitionMap = Awaited<ReturnType<typeof definitions>>

/** Reverse edges from every branch/projection, then transitive closure with cycle guards. */
function descendantLookup(data: Definitions) {
  const children = new Map<string, Set<string>>()
  for (const { division } of data.records)
    for (const paths of Object.values(division.hierarchies))
      for (const path of paths)
        for (const parent of path) {
          const ids = children.get(parent.id) ?? new Set<string>()
          ids.add(division.id)
          children.set(parent.id, ids)
        }
  return (id: string) => {
    const seen = new Set([id])
    const queue = [id]
    for (let i = 0; i < queue.length; i++)
      for (const child of children.get(queue[i]!) ?? [])
        if (!seen.has(child)) {
          seen.add(child)
          queue.push(child)
        }
    seen.delete(id)
    return [...seen].sort(compare)
  }
}
const CursorSchema = z
  .object({
    version: z.literal(1),
    from: z.string().min(1),
    to: z.string().min(1),
    comparison: z.string().regex(/^[a-f0-9]{64}$/),
    after: z.string().nullable(),
  })
  .strict()
type Cursor = z.infer<typeof CursorSchema>
function encodeCursor(cursor: Cursor) {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
function decodeCursor(value?: string): Cursor | null {
  if (!value) return null
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('encoding')
    return CursorSchema.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
          Uint8Array.from(
            atob(value.replaceAll('-', '+').replaceAll('_', '/')),
            character => character.charCodeAt(0),
          ),
        ),
      ),
    )
  } catch {
    throw new DivisionChangesError(
      422,
      'invalid_cursor',
      'The page cursor is malformed.',
    )
  }
}
function releaseReference(release: GeocodingRelease) {
  const { id, code, cohortKey, domainCode, schemaVersion, rulesetVersion } = release
  return { id, code, cohortKey, domainCode, schemaVersion, rulesetVersion }
}
function reference(
  id: string,
  map: DefinitionMap,
  release: GeocodingRelease,
  origin: string,
) {
  const definition = map.get(id)
  if (!definition) return null
  const record = new URL(
    `/api/v1/divisions/changes/definitions/${encodeURIComponent(id)}`,
    origin,
  )
  record.searchParams.set('apiReleaseSet', release.id)
  record.searchParams.set('definitionHash', definition.hash)
  const { membershipGeometry, ...attributes } = definition.content
  return {
    divisionId: id,
    apiReleaseSetId: release.id,
    apiReleaseSet: release.code,
    definitionHash: definition.hash,
    record: record.toString(),
    attributes,
    membershipGeometry,
  }
}

/** Content-addressed retrieval cannot silently return a different fixture after deployment. */
export async function getDivisionChangeDefinition(
  args: GeocodingDatabases & {
    id: string
    apiReleaseSet: string
    definitionHash: string
    requestUrl: string
    dependencies?: Partial<DivisionChangesDependencies>
  },
) {
  const dependencies = {
    resolveRelease: resolveDivisionChangesRelease,
    loadDefinitions: loadGeocodingDivisions,
    ...args.dependencies,
  }
  try {
    const release = await dependencies.resolveRelease(args.metaDb, args.apiReleaseSet)
    const loaded = await dependencies.loadDefinitions(args, release)
    const data = await definitions({
      ...loaded,
      records: loaded.records.filter(record => record.division.id === args.id),
    })
    if (data.get(args.id)?.hash !== args.definitionHash)
      throw new DivisionChangesError(
        503,
        'definition_unavailable',
        'The exact requested division definition is not available in this release.',
      )
    return {
      status: 200 as const,
      body: reference(args.id, data, release, new URL(args.requestUrl).origin)!,
    }
  } catch (error) {
    if (error instanceof DivisionChangesError)
      return {
        status: error.status,
        body: { error: error.code, message: error.message },
      }
    if (error instanceof PublicationReadUnavailableError)
      return {
        status: 503 as const,
        body: { error: 'release_set_unavailable', message: error.message },
      }
    throw error
  }
}

export async function listDivisionChanges(
  args: GeocodingDatabases & {
    query: DivisionChangesQuery
    requestUrl: string
    dependencies?: Partial<DivisionChangesDependencies>
  },
): Promise<
  | { status: 200; body: DivisionChangesResponse }
  | { status: 409 | 422 | 503; body: { error: string; message: string } }
> {
  const dependencies = {
    resolveRelease: resolveDivisionChangesRelease,
    loadDefinitions: loadGeocodingDivisions,
    ...args.dependencies,
  }
  try {
    const cursor = decodeCursor(args.query['page[cursor]'])
    // A cursor owns the target even when the caller omits toApiReleaseSet again.
    const [from, to] = await Promise.all([
      dependencies.resolveRelease(args.metaDb, args.query.fromApiReleaseSet),
      dependencies.resolveRelease(
        args.metaDb,
        args.query.toApiReleaseSet ?? cursor?.to,
      ),
    ])
    if (cursor && (cursor.from !== from.id || cursor.to !== to.id))
      throw new DivisionChangesError(
        422,
        'cursor_release_mismatch',
        'The cursor belongs to a different release pair.',
      )
    if (
      from.domainCode !== to.domainCode ||
      from.schemaVersion !== to.schemaVersion ||
      from.rulesetVersion !== to.rulesetVersion
    )
      throw new DivisionChangesError(
        409,
        'incompatible_release_sets',
        'Release sets must have matching geographic domain, schema and ruleset versions.',
      )
    const [beforeData, afterData] = await Promise.all([
      dependencies.loadDefinitions(args, from),
      dependencies.loadDefinitions(args, to),
    ])
    const [before, after] = await Promise.all([
      definitions(beforeData),
      definitions(afterData),
    ])
    const comparisonId = await hash({
      version: 1,
      from: releaseReference(from),
      to: releaseReference(to),
      before: [...before].map(([id, value]) => [id, value.hash]),
      after: [...after].map(([id, value]) => [id, value.hash]),
    })
    if (cursor && cursor.comparison !== comparisonId)
      throw new DivisionChangesError(
        503,
        'comparison_unavailable',
        'The exact definitions pinned by this cursor are no longer available.',
      )
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .sort(compare)
      .filter(id => before.get(id)?.hash !== after.get(id)?.hash)
    if (cursor?.after && !changed.includes(cursor.after))
      throw new DivisionChangesError(
        422,
        'invalid_cursor',
        'The cursor does not identify a change in this comparison.',
      )
    const limit = args.query['page[limit]']
    const remaining = changed.filter(
      id => !cursor?.after || compare(id, cursor.after) > 0,
    )
    const selected = remaining.slice(0, limit)
    const beforeDescendants = descendantLookup(beforeData)
    const afterDescendants = descendantLookup(afterData)
    const origin = new URL(args.requestUrl).origin
    const data = await Promise.all(
      selected.map(async divisionId => {
        const oldDefinition = before.get(divisionId)
        const newDefinition = after.get(divisionId)
        const changedFields = [
          ...new Set([
            ...Object.keys(oldDefinition?.content ?? {}),
            ...Object.keys(newDefinition?.content ?? {}),
          ]),
        ]
          .sort(compare)
          .filter(
            field =>
              canonical(
                oldDefinition?.content[field as keyof typeof oldDefinition.content],
              ) !==
              canonical(
                newDefinition?.content[field as keyof typeof newDefinition.content],
              ),
          ) as DivisionChangedField[]
        const type = !oldDefinition
          ? 'addition'
          : !newDefinition
            ? 'deletion'
            : 'revision'
        const canAffectGeocodingMembership =
          type !== 'revision' ||
          changedFields.some(field => membershipFields.has(field))
        return {
          id: await hash({
            version: 1,
            comparisonId,
            divisionId,
            before: oldDefinition?.hash ?? null,
            after: newDefinition?.hash ?? null,
          }),
          divisionId,
          type,
          changedFields,
          canAffectGeocodingMembership,
          before: reference(divisionId, before, from, origin),
          after: reference(divisionId, after, to, origin),
          affectedDescendantIds: {
            before: canAffectGeocodingMembership ? beforeDescendants(divisionId) : [],
            after: canAffectGeocodingMembership ? afterDescendants(divisionId) : [],
          },
        } as DivisionChangesResponse['data'][number]
      }),
    )
    const makeCursor = (after: string | null) =>
      encodeCursor({
        version: 1,
        from: from.id,
        to: to.id,
        comparison: comparisonId,
        after,
      })
    const nextCursor = remaining.length > limit ? makeCursor(selected.at(-1)!) : null
    const link = (value: string) => {
      const url = new URL('/api/v1/divisions/changes', origin)
      url.searchParams.set('fromApiReleaseSet', from.id)
      url.searchParams.set('toApiReleaseSet', to.id)
      url.searchParams.set('page[limit]', String(limit))
      url.searchParams.set('page[cursor]', value)
      return url.toString()
    }
    const coverage = (map: DefinitionMap) => ({
      divisions: map.size,
      withMembershipGeometry: [...map.values()].filter(
        value => value.content.membershipGeometry.length > 0,
      ).length,
    })
    return {
      status: 200,
      body: {
        data,
        meta: {
          fromApiReleaseSet: releaseReference(from),
          toApiReleaseSet: releaseReference(to),
          comparisonId,
          total: changed.length,
          limit,
          nextCursor,
          membershipGeometry: 'stub',
          dependencies: 'transitive-before-and-after',
          coverage: { before: coverage(before), after: coverage(after) },
        },
        links: {
          self: link(makeCursor(cursor?.after ?? null)),
          first: link(makeCursor(null)),
          next: nextCursor ? link(nextCursor) : null,
        },
      },
    }
  } catch (error) {
    if (error instanceof DivisionChangesError)
      return {
        status: error.status,
        body: { error: error.code, message: error.message },
      }
    if (error instanceof PublicationReadUnavailableError)
      return {
        status: 503,
        body: { error: 'release_set_unavailable', message: error.message },
      }
    throw error
  }
}
