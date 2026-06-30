import type { CurrentDatabase } from '@repo/db'
import { and, asc, eq, inArray, sql } from '@repo/db'
import { currentSchema } from '@repo/db'
import type { RequestedApiLocale, RequestedApiLocaleSelection } from '@repo/core'

const { divisions, divisionsI18n } = currentSchema

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

export type DivisionRecord = {
  division: {
    snapshotId: string
    id: string
    level: number
    type: string
    geometry: typeof divisions.$inferSelect.geometry
    bbox: typeof divisions.$inferSelect.bbox
    population: number | null
    subtype: string | null
    class: string | null
    wikidata: string | null
    hierarchy: typeof divisions.$inferSelect.hierarchy
    parentDivisionId: string | null
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
  localeSelection: DivisionLocaleSelection
}

type DivisionListLookup = {
  snapshotId: string
  limit?: number
  offset?: number
  level?: number
  type?: string
  parentDivisionId?: string
  localeSelection: DivisionLocaleSelection
}

type DivisionIdsLookup = {
  snapshotId: string
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
  population: number | null
  subtype: string | null
  class: string | null
  wikidata: string | null
  hierarchy: typeof divisions.$inferSelect.hierarchy
  parentDivisionId: string | null
  cartography: typeof divisions.$inferSelect.cartography
  sources: typeof divisions.$inferSelect.sources
  createdAt: string
  updatedAt: string
  i18n: string
}

export type DivisionLocaleSelection = RequestedApiLocaleSelection

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

function mapDivisionRow(row: DivisionRow): DivisionRecord {
  const rawI18n = JSON.parse(row.i18n) as Record<string, unknown>

  return {
    division: {
      snapshotId: row.snapshotId,
      id: row.id,
      level: row.level,
      type: row.type,
      geometry: row.geometry,
      bbox: row.bbox,
      population: row.population,
      subtype: row.subtype,
      class: row.class,
      wikidata: row.wikidata,
      hierarchy: row.hierarchy,
      parentDivisionId: row.parentDivisionId,
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
    'snapshotId' | 'level' | 'type' | 'parentDivisionId'
  >,
) {
  return [
    eq(divisions.snapshotId, lookup.snapshotId),
    lookup.level !== undefined ? eq(divisions.level, lookup.level) : undefined,
    lookup.type ? eq(divisions.type, lookup.type) : undefined,
    lookup.parentDivisionId
      ? eq(divisions.parentDivisionId, lookup.parentDivisionId)
      : undefined,
  ].filter(condition => condition !== undefined)
}

export async function getDivisionRecordCurrent(
  db: CurrentDatabase,
  lookup: DivisionLookup,
): Promise<DivisionRecord | null> {
  const records = await listDivisionRecordsCurrentByIds(db, {
    snapshotId: lookup.snapshotId,
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
      population: divisions.population,
      subtype: divisions.subtype,
      class: divisions.class,
      wikidata: divisions.wikidata,
      hierarchy: divisions.hierarchy,
      parentDivisionId: divisions.parentDivisionId,
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
        eq(divisions.snapshotId, lookup.snapshotId),
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
  const rows = await db
    .select({
      snapshotId: divisions.snapshotId,
      id: divisions.id,
      level: divisions.level,
      type: divisions.type,
      geometry: divisions.geometry,
      bbox: divisions.bbox,
      population: divisions.population,
      subtype: divisions.subtype,
      class: divisions.class,
      wikidata: divisions.wikidata,
      hierarchy: divisions.hierarchy,
      parentDivisionId: divisions.parentDivisionId,
      cartography: divisions.cartography,
      sources: divisions.sources,
      createdAt: divisions.createdAt,
      updatedAt: divisions.updatedAt,
      i18n,
    })
    .from(divisions)
    .where(
      and(
        eq(divisions.snapshotId, lookup.snapshotId),
        inArray(divisions.id, lookup.divisionIds),
      ),
    )
    .orderBy(asc(divisions.level), asc(divisions.type), asc(divisions.id))
    .all()

  return rows.map(row => mapDivisionRow(row))
}
