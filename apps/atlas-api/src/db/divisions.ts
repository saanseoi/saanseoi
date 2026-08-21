import type { CurrentDatabase } from '@repo/db'
import { and, asc, eq, inArray, sql } from '@repo/db'
import { currentSchema } from '@repo/db'
import type { RequestedApiLocale, RequestedApiLocaleSelection } from '@repo/core'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/brotliJson.ts'

const { divisions, divisionsI18n, divisionAreas, divisionBoundaries } = currentSchema
const D1_MAX_BOUND_VARIABLES = 100

function chunkD1Values(values: string[], reservedVariables: number) {
  const uniqueValues = [...new Set(values)]
  const chunkSize = Math.max(1, D1_MAX_BOUND_VARIABLES - reservedVariables)
  return Array.from(
    { length: Math.ceil(uniqueValues.length / chunkSize) },
    (_, index) => uniqueValues.slice(index * chunkSize, (index + 1) * chunkSize),
  )
}

function decodeStoredDivisionGeometry(value: unknown) {
  if (value instanceof Uint8Array) return decompressJsonBrotli(value)
  if (value instanceof ArrayBuffer) return decompressJsonBrotli(value)
  return value
}

export type DivisionNameRule = {
  value: string
  variant: string | null
}

export type DivisionLocaleValue = {
  name: string | null
  nameVariant?: string[] | null
  nameAlts?: string[] | null
  nameRules?: DivisionNameRule[] | null
}

export type DivisionLocaleCode = RequestedApiLocale
export type DivisionSourceKeys = Record<string, Record<string, unknown>>

export type DivisionRecord = {
  division: {
    snapshotId: string
    id: string
    level: number
    type: string
    geometry: typeof divisions.$inferSelect.geometry
    bbox: typeof divisions.$inferSelect.bbox
    sourceKeys: DivisionSourceKeys | null
    identifiers?: typeof divisions.$inferSelect.identifiers
    subtype: string | null
    class: string | null
    overtureFeatureVersion: number | null
    overtureAdminLevel: number | null
    overtureHierarchies: unknown
    wikidata: string | null
    hierarchy: typeof divisions.$inferSelect.hierarchy
    cartography: typeof divisions.$inferSelect.cartography
    sources: typeof divisions.$inferSelect.sources
    createdAt: string
    updatedAt: string
  }
  i18n: Record<string, DivisionLocaleValue>
}

type DivisionLookup = {
  divisionId: string
  snapshotId: string
  snapshotIds?: string[]
  localeSelection: DivisionLocaleSelection
}

type DivisionListLookup = {
  snapshotId: string
  snapshotIds?: string[]
  limit?: number
  offset?: number
  level?: number
  type?: string
  parentId?: string
  localeSelection: DivisionLocaleSelection
}

type DivisionIdsLookup = {
  snapshotId: string
  snapshotIds?: string[]
  divisionIds: string[]
  localeSelection: DivisionLocaleSelection
}

type DivisionRow = {
  snapshotId: string
  id: string
  level: number
  type: string
  geometry: typeof divisions.$inferSelect.geometry
  bbox: typeof divisions.$inferSelect.bbox
  sourceKeys: typeof divisions.$inferSelect.sourceKeys
  identifiers: typeof divisions.$inferSelect.identifiers
  wikidata: string | null
  hierarchy: typeof divisions.$inferSelect.hierarchy
  cartography: typeof divisions.$inferSelect.cartography
  sources: typeof divisions.$inferSelect.sources
  createdAt: string
  updatedAt: string
  i18n: string
}

export type DivisionLocaleSelection = RequestedApiLocaleSelection

export type DivisionAreaRecord = {
  id: string
  variant: string
  divisionId: string
  bbox: typeof divisionAreas.$inferSelect.bbox
  geometry: typeof divisionAreas.$inferSelect.geometry
  sourceKeys: typeof divisionAreas.$inferSelect.sourceKeys
  sources: typeof divisionAreas.$inferSelect.sources
  type: string
  isLand: boolean | null
  isTerritorial: boolean | null
}

export type DivisionBoundaryRecord = {
  id: string
  variant: string
  leftDivisionId: string
  rightDivisionId: string
  bbox: typeof divisionBoundaries.$inferSelect.bbox
  geometry: typeof divisionBoundaries.$inferSelect.geometry
  sourceKeys: typeof divisionBoundaries.$inferSelect.sourceKeys
  sources: typeof divisionBoundaries.$inferSelect.sources
  type: string
  isLand: boolean | null
  isTerritorial: boolean | null
}

export async function listDivisionAreasCurrentByDivisionIds(
  db: CurrentDatabase,
  lookup: { snapshotId: string; divisionIds: string[]; variant?: string },
) {
  if (lookup.divisionIds.length === 0) return []
  const chunks = chunkD1Values(lookup.divisionIds, 1 + (lookup.variant ? 1 : 0))
  const rows = (
    await Promise.all(
      chunks.map(divisionIds =>
        db
          .select({
            id: divisionAreas.id,
            variant: divisionAreas.variant,
            divisionId: divisionAreas.divisionId,
            bbox: divisionAreas.bbox,
            geometry: divisionAreas.geometry,
            sourceKeys: divisionAreas.sourceKeys,
            sources: divisionAreas.sources,
            type: divisionAreas.type,
            isLand: divisionAreas.isLand,
            isTerritorial: divisionAreas.isTerritorial,
          })
          .from(divisionAreas)
          .where(
            and(
              eq(divisionAreas.snapshotId, lookup.snapshotId),
              inArray(divisionAreas.divisionId, divisionIds),
              ...(lookup.variant ? [eq(divisionAreas.variant, lookup.variant)] : []),
            ),
          )
          .all(),
      ),
    )
  ).flat()
  return rows.map(row => ({
    ...row,
    geometry: decodeStoredDivisionGeometry(row.geometry),
  })) as DivisionAreaRecord[]
}

export async function listDivisionBoundariesCurrentByDivisionIds(
  db: CurrentDatabase,
  lookup: { snapshotId: string; divisionIds: string[]; variant?: string },
) {
  if (lookup.divisionIds.length === 0) return []
  const chunks = chunkD1Values(lookup.divisionIds, 1 + (lookup.variant ? 1 : 0))
  const rows = (
    await Promise.all(
      chunks.map(async divisionIds => {
        const selection = {
          id: divisionBoundaries.id,
          variant: divisionBoundaries.variant,
          leftDivisionId: divisionBoundaries.leftDivisionId,
          rightDivisionId: divisionBoundaries.rightDivisionId,
          bbox: divisionBoundaries.bbox,
          geometry: divisionBoundaries.geometry,
          sourceKeys: divisionBoundaries.sourceKeys,
          sources: divisionBoundaries.sources,
          type: divisionBoundaries.type,
          isLand: divisionBoundaries.isLand,
          isTerritorial: divisionBoundaries.isTerritorial,
        }
        return Promise.all([
          db
            .select(selection)
            .from(divisionBoundaries)
            .where(
              and(
                eq(divisionBoundaries.snapshotId, lookup.snapshotId),
                inArray(divisionBoundaries.leftDivisionId, divisionIds),
                ...(lookup.variant
                  ? [eq(divisionBoundaries.variant, lookup.variant)]
                  : []),
              ),
            )
            .all(),
          db
            .select(selection)
            .from(divisionBoundaries)
            .where(
              and(
                eq(divisionBoundaries.snapshotId, lookup.snapshotId),
                inArray(divisionBoundaries.rightDivisionId, divisionIds),
                ...(lookup.variant
                  ? [eq(divisionBoundaries.variant, lookup.variant)]
                  : []),
              ),
            )
            .all(),
        ])
      }),
    )
  ).flat(2)
  const uniqueRows = [...new Map(rows.map(row => [row.id, row])).values()]

  return uniqueRows.map(row => ({
    ...row,
    geometry: decodeStoredDivisionGeometry(row.geometry),
  })) as DivisionBoundaryRecord[]
}

function buildDivisionI18nCondition(localeSelection: DivisionLocaleSelection) {
  return and(
    eq(divisionsI18n.snapshotId, divisions.snapshotId),
    eq(divisionsI18n.divisionId, divisions.id),
    localeSelection.mode === 'requested' && localeSelection.locales.length > 0
      ? inArray(divisionsI18n.locale, localeSelection.locales)
      : undefined,
  )
}

function buildDivisionI18nJsonSelection(localeSelection: DivisionLocaleSelection) {
  if (localeSelection.mode === 'none') {
    return sql<string>`'{}'`
  }

  const condition = buildDivisionI18nCondition(localeSelection)

  return sql<string>`coalesce((
    select json_group_object(
      ${divisionsI18n.locale},
      json_object(
        'name', ${divisionsI18n.name},
        'nameVariant', ${divisionsI18n.nameVariant},
        'nameAlts', ${divisionsI18n.nameAlts},
        'nameRules', ${divisionsI18n.nameRules}
      )
    )
    from ${divisionsI18n}
    where ${condition}
  ), '{}')`
}

function parseOptionalJsonString<T>(value: unknown): T | null | undefined {
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return undefined
  }

  return JSON.parse(value) as T
}

function mapDivisionLocaleValue(value: unknown): DivisionLocaleValue {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const nameAlts =
    typeof raw.nameAlts === 'string'
      ? raw.nameAlts
          .split('|')
          .map(item => item.trim())
          .filter(item => item.length > 0)
      : raw.nameAlts === null
        ? null
        : undefined

  return {
    name: typeof raw.name === 'string' ? raw.name : null,
    nameVariant: parseOptionalJsonString<string[]>(raw.nameVariant),
    nameAlts,
    nameRules: parseOptionalJsonString<DivisionNameRule[]>(raw.nameRules),
  }
}

function mapDivisionSourceKeys(value: unknown): DivisionSourceKeys | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as DivisionSourceKeys
}

function getDivisionSourceKey(
  sourceKeys: DivisionSourceKeys | null,
  source: string,
  key: string,
) {
  const value = sourceKeys?.[source]?.[key]
  return typeof value === 'string' ? value : null
}

function getDivisionSourceNumber(
  sourceKeys: DivisionSourceKeys | null,
  source: string,
  key: string,
) {
  const value = sourceKeys?.[source]?.[key]
  return typeof value === 'number' ? value : null
}

function getDivisionSourceValue(
  sourceKeys: DivisionSourceKeys | null,
  source: string,
  key: string,
) {
  return sourceKeys?.[source]?.[key]
}

function mapDivisionRow(row: DivisionRow): DivisionRecord {
  const rawI18n = JSON.parse(row.i18n) as Record<string, unknown>
  const sourceKeys = mapDivisionSourceKeys(row.sourceKeys)

  return {
    division: {
      snapshotId: row.snapshotId,
      id: row.id,
      level: row.level,
      type: row.type,
      geometry: row.geometry,
      bbox: row.bbox,
      sourceKeys,
      identifiers: row.identifiers,
      subtype: getDivisionSourceKey(sourceKeys, 'overture', 'subtype'),
      class: getDivisionSourceKey(sourceKeys, 'overture', 'class'),
      overtureFeatureVersion: getDivisionSourceNumber(
        sourceKeys,
        'overture',
        'version',
      ),
      overtureAdminLevel: getDivisionSourceNumber(
        sourceKeys,
        'overture',
        'admin_level',
      ),
      overtureHierarchies: getDivisionSourceValue(
        sourceKeys,
        'overture',
        'hierarchies',
      ),
      wikidata: row.wikidata,
      hierarchy: row.hierarchy,
      cartography: row.cartography,
      sources: row.sources,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    i18n: Object.fromEntries(
      Object.entries(rawI18n).map(([locale, value]) => [
        locale,
        mapDivisionLocaleValue(value),
      ]),
    ),
  }
}

function buildDivisionConditions(
  lookup: Pick<
    DivisionListLookup,
    'snapshotId' | 'snapshotIds' | 'level' | 'type' | 'parentId'
  >,
) {
  return [
    inArray(divisions.snapshotId, lookup.snapshotIds ?? [lookup.snapshotId]),
    lookup.level !== undefined ? eq(divisions.level, lookup.level) : undefined,
    lookup.type ? eq(divisions.type, lookup.type) : undefined,
    lookup.parentId
      ? sql`coalesce(json_array_length(${divisions.hierarchy}), 0) > 0
          and json_extract(${divisions.hierarchy}, printf('$[%d].division_id', json_array_length(${divisions.hierarchy}) - 1)) = ${lookup.parentId}`
      : undefined,
  ].filter(condition => condition !== undefined)
}

export async function getDivisionRecordCurrent(
  db: CurrentDatabase,
  lookup: DivisionLookup,
): Promise<DivisionRecord | null> {
  const records = await listDivisionRecordsCurrentByIds(db, {
    snapshotId: lookup.snapshotId,
    snapshotIds: lookup.snapshotIds,
    divisionIds: [lookup.divisionId],
    localeSelection: lookup.localeSelection,
  })

  return records[0] ?? null
}

export async function listDivisionRecordsCurrent(
  db: CurrentDatabase,
  lookup: DivisionListLookup,
): Promise<DivisionRecord[]> {
  const i18n = buildDivisionI18nJsonSelection(lookup.localeSelection)
  const pagedDivisions = db
    .select({
      snapshotId: divisions.snapshotId,
      id: divisions.id,
    })
    .from(divisions)
    .where(and(...buildDivisionConditions(lookup)))
    .orderBy(asc(divisions.level), asc(divisions.type), asc(divisions.id))
    .limit(lookup.limit ?? 25)
    .offset(lookup.offset ?? 0)
    .as('pagedDivisions')

  const rows = await db
    .select({
      snapshotId: divisions.snapshotId,
      id: divisions.id,
      level: divisions.level,
      type: divisions.type,
      geometry: divisions.geometry,
      bbox: divisions.bbox,
      sourceKeys: divisions.sourceKeys,
      identifiers: divisions.identifiers,
      wikidata: divisions.wikidata,
      hierarchy: divisions.hierarchy,
      cartography: divisions.cartography,
      sources: divisions.sources,
      createdAt: divisions.createdAt,
      updatedAt: divisions.updatedAt,
      i18n,
    })
    .from(pagedDivisions)
    .innerJoin(
      divisions,
      and(
        eq(divisions.snapshotId, pagedDivisions.snapshotId),
        eq(divisions.id, pagedDivisions.id),
      ),
    )
    .orderBy(asc(divisions.level), asc(divisions.type), asc(divisions.id))
    .all()

  return rows.map(row => mapDivisionRow(row))
}

export async function countDivisionsCurrent(
  db: CurrentDatabase,
  lookup: Omit<DivisionListLookup, 'limit' | 'offset' | 'localeSelection'>,
) {
  const row = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(divisions)
    .where(and(...buildDivisionConditions(lookup)))
    .limit(1)
    .get()

  return Number(row?.count ?? 0)
}

export async function listDivisionRecordsCurrentByIds(
  db: CurrentDatabase,
  lookup: DivisionIdsLookup,
): Promise<DivisionRecord[]> {
  if (lookup.divisionIds.length === 0) {
    return []
  }

  const i18n = buildDivisionI18nJsonSelection(lookup.localeSelection)
  // D1 permits at most 100 bound variables. Reserve one for every selected
  // division snapshot as well as the requested canonical IDs.
  const chunks = chunkD1Values(lookup.divisionIds, lookup.snapshotIds?.length ?? 1)
  const rows = (
    await Promise.all(
      chunks.map(divisionIds =>
        db
          .select({
            snapshotId: divisions.snapshotId,
            id: divisions.id,
            level: divisions.level,
            type: divisions.type,
            geometry: divisions.geometry,
            bbox: divisions.bbox,
            sourceKeys: divisions.sourceKeys,
            identifiers: divisions.identifiers,
            wikidata: divisions.wikidata,
            hierarchy: divisions.hierarchy,
            cartography: divisions.cartography,
            sources: divisions.sources,
            createdAt: divisions.createdAt,
            updatedAt: divisions.updatedAt,
            i18n,
          })
          .from(divisions)
          .where(
            and(
              inArray(divisions.snapshotId, lookup.snapshotIds ?? [lookup.snapshotId]),
              inArray(divisions.id, divisionIds),
            ),
          )
          .orderBy(asc(divisions.level), asc(divisions.type), asc(divisions.id))
          .all(),
      ),
    )
  ).flat()

  return rows.map(row => mapDivisionRow(row))
}
