import type { AddressBlockType, CurrentDatabase } from '@repo/db'
import { addressBlockTypes, and, asc, eq, ne, sql } from '@repo/db'
import { currentSchema } from '@repo/db'
import type { Address3dCoverage } from '@repo/db/address3d'
import type { RequestedApiLocaleSelection } from '@repo/core'

const {
  address2d,
  address2dBuildingNumberLookup,
  address2dI18n,
  addressesFts,
  addressesFtsMatch,
  addressSearchScopes,
} = currentSchema

export type AddressLocaleValue = {
  formattedAddress: string
  buildingName?: string | null
  buildingNumberExpression?: string | null
  buildingNumberFrom?: string | null
  buildingNumberTo?: string | null
  buildingNumberConnector?: string | null
  blockExpression?: string | null
  blockType?: AddressBlockType | null
  blockRef?: string | null
  blockTypeBeforeNumber?: boolean | null
  phaseExpression?: string | null
  phaseName?: string | null
  phaseRef?: string | null
  estateName?: string | null
  streetName?: string | null
}

export type AddressRecord = {
  address3dCoverage?: Address3dCoverage
  address: {
    snapshotId: string
    divisionSnapshotId: string | null
    id: string
    geometry: unknown
    bbox: unknown
    identifiers: unknown
    sources: unknown
    parentAddressId: string | null
    granularity: typeof address2d.$inferSelect.granularity
    countryId: string | null
    areaId: string | null
    districtId: string | null
    townId: string | null
    macrohoodId: string | null
    neighbourhoodId: string | null
    microhoodId: string | null
    villageId: string | null
    hamletId: string | null
    createdAt: string
    updatedAt: string
  }
  i18n: Record<string, AddressLocaleValue>
}

type AddressLookup = {
  snapshotIds: string[]
  addressId: string
  localeSelection: RequestedApiLocaleSelection
}

type AddressListLookup = {
  snapshotIds: string[]
  limit?: number
  offset?: number
  after?: string
  countryId?: string
  areaId?: string
  districtId?: string
  localeSelection: RequestedApiLocaleSelection
}

export type AddressSearchMode = 'component' | 'exact' | 'full-text' | 'prefix' | 'range'

export type AddressSearchComponent =
  | 'block'
  | 'building'
  | 'estate'
  | 'formatted'
  | 'number'
  | 'phase'
  | 'street'

const ADDRESS_FTS_ALIAS_GROUPS = [
  ['blk', 'blks', 'block', 'blocks'],
  ['bldg', 'bldgs', 'building', 'buildings'],
  ['twr', 'tower', 'towers'],
  ['hse', 'hses', 'house', 'houses'],
  ['apt', 'apts', 'apartment', 'apartments'],
] as const

const ADDRESS_FTS_TOKEN_ALIASES = new Map<string, readonly string[]>(
  ADDRESS_FTS_ALIAS_GROUPS.flatMap(group =>
    group.map(token => [token, group] as const),
  ),
)

type AddressSearchLookup = Pick<
  AddressListLookup,
  'snapshotIds' | 'countryId' | 'areaId' | 'districtId'
> & {
  component?: AddressSearchComponent
  limit: number
  mode: AddressSearchMode
  offset: number
  query: string
}

type AddressRow = {
  snapshotId: string
  divisionSnapshotId: string | null
  id: string
  geometry: typeof address2d.$inferSelect.geometry
  bbox: typeof address2d.$inferSelect.bbox
  identifiers: typeof address2d.$inferSelect.identifiers
  sources: typeof address2d.$inferSelect.sources
  parentAddressId: string | null
  granularity: typeof address2d.$inferSelect.granularity
  countryId: string | null
  areaId: string | null
  districtId: string | null
  townId: string | null
  macrohoodId: string | null
  neighbourhoodId: string | null
  microhoodId: string | null
  villageId: string | null
  hamletId: string | null
  createdAt: string
  updatedAt: string
  i18n: string
}

function buildAddressI18nCondition(localeSelection: RequestedApiLocaleSelection) {
  return and(
    eq(address2dI18n.snapshotId, address2d.snapshotId),
    eq(address2dI18n.addressId, address2d.id),
    localeSelection.mode === 'requested' && localeSelection.locales.length > 0
      ? sql`${address2dI18n.locale} in (select value from json_each(${JSON.stringify(localeSelection.locales)}))`
      : undefined,
  )
}

function buildAddressI18nJsonSelection(localeSelection: RequestedApiLocaleSelection) {
  if (localeSelection.mode === 'none') return sql<string>`'{}'`

  const condition = buildAddressI18nCondition(localeSelection)

  return sql<string>`coalesce((
    select json_group_object(
      ${address2dI18n.locale},
      json_object(
        'formattedAddress', ${address2dI18n.formattedAddress},
        'buildingName', ${address2dI18n.buildingName},
        'buildingNumberExpression', ${address2dI18n.buildingNumberExpression},
        'buildingNumberFrom', ${address2dI18n.buildingNumberFrom},
        'buildingNumberTo', ${address2dI18n.buildingNumberTo},
        'buildingNumberConnector', ${address2dI18n.buildingNumberConnector},
        'blockExpression', ${address2dI18n.blockExpression},
        'blockType', ${address2dI18n.blockType},
        'blockRef', ${address2dI18n.blockRef},
        'blockTypeBeforeNumber', ${address2dI18n.blockTypeBeforeNumber},
        'phaseExpression', ${address2dI18n.phaseExpression},
        'phaseName', ${address2dI18n.phaseName},
        'phaseRef', ${address2dI18n.phaseRef},
        'estateName', ${address2dI18n.estateName},
        'streetName', ${address2dI18n.streetName}
      )
    )
    from ${address2dI18n}
    where ${condition}
  ), '{}')`
}

function parseI18n(value: string): Record<string, AddressLocaleValue> {
  const parsed = JSON.parse(value) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([locale, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const record = raw as Record<string, unknown>
      if (typeof record.formattedAddress !== 'string') return []

      return [
        [
          locale,
          {
            formattedAddress: record.formattedAddress,
            buildingName: asNullableString(record.buildingName),
            buildingNumberExpression: asNullableString(record.buildingNumberExpression),
            buildingNumberFrom: asNullableString(record.buildingNumberFrom),
            buildingNumberTo: asNullableString(record.buildingNumberTo),
            buildingNumberConnector: asNullableString(record.buildingNumberConnector),
            blockExpression: asNullableString(record.blockExpression),
            blockType: asNullableBlockType(record.blockType),
            blockRef: asNullableString(record.blockRef),
            blockTypeBeforeNumber: asNullableBoolean(record.blockTypeBeforeNumber),
            phaseExpression: asNullableString(record.phaseExpression),
            phaseName: asNullableString(record.phaseName),
            phaseRef: asNullableString(record.phaseRef),
            estateName: asNullableString(record.estateName),
            streetName: asNullableString(record.streetName),
          },
        ],
      ]
    }),
  )
}

function mapAddressRow(row: AddressRow): AddressRecord {
  return {
    address: {
      snapshotId: row.snapshotId,
      divisionSnapshotId: row.divisionSnapshotId,
      id: row.id,
      geometry: row.geometry,
      bbox: row.bbox,
      identifiers: row.identifiers,
      sources: row.sources,
      parentAddressId: row.parentAddressId,
      granularity: row.granularity,
      countryId: row.countryId,
      areaId: row.areaId,
      districtId: row.districtId,
      townId: row.townId,
      macrohoodId: row.macrohoodId,
      neighbourhoodId: row.neighbourhoodId,
      microhoodId: row.microhoodId,
      villageId: row.villageId,
      hamletId: row.hamletId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    i18n: parseI18n(row.i18n),
  }
}

function buildAddressConditions(
  lookup: Pick<
    AddressListLookup,
    'snapshotIds' | 'countryId' | 'areaId' | 'districtId'
  >,
) {
  return [
    // One bound JSON array preserves global SQL pagination without an unbounded
    // IN parameter list. An empty selection deliberately matches no rows.
    sql`${address2d.snapshotId} in (select value from json_each(${JSON.stringify(lookup.snapshotIds)}))`,
    lookup.countryId ? eq(address2d.countryId, lookup.countryId) : undefined,
    lookup.areaId ? eq(address2d.areaId, lookup.areaId) : undefined,
    lookup.districtId ? eq(address2d.districtId, lookup.districtId) : undefined,
  ].filter(condition => condition !== undefined)
}

export async function getAddressRecordCurrent(
  db: CurrentDatabase,
  lookup: AddressLookup,
): Promise<AddressRecord | null> {
  const i18n = buildAddressI18nJsonSelection(lookup.localeSelection)
  const row = await db
    .select({
      snapshotId: address2d.snapshotId,
      divisionSnapshotId: address2d.divisionSnapshotId,
      id: address2d.id,
      geometry: address2d.geometry,
      bbox: address2d.bbox,
      identifiers: address2d.identifiers,
      sources: address2d.sources,
      parentAddressId: address2d.parentAddressId,
      granularity: address2d.granularity,
      countryId: address2d.countryId,
      areaId: address2d.areaId,
      districtId: address2d.districtId,
      townId: address2d.townId,
      macrohoodId: address2d.macrohoodId,
      neighbourhoodId: address2d.neighbourhoodId,
      microhoodId: address2d.microhoodId,
      villageId: address2d.villageId,
      hamletId: address2d.hamletId,
      createdAt: address2d.createdAt,
      updatedAt: address2d.updatedAt,
      i18n,
    })
    .from(address2d)
    .where(and(...buildAddressConditions(lookup), eq(address2d.id, lookup.addressId)))
    .limit(1)
    .get()

  return row ? mapAddressRow(row as AddressRow) : null
}

export async function hasCurrentAddressSnapshot(
  db: CurrentDatabase,
  snapshotId: string,
) {
  return Boolean(
    await db
      .select({ id: address2d.id })
      .from(address2d)
      .where(eq(address2d.snapshotId, snapshotId))
      .limit(1)
      .get(),
  )
}

export async function listAddressRecordsCurrent(
  db: CurrentDatabase,
  lookup: AddressListLookup,
): Promise<AddressRecord[]> {
  const i18n = buildAddressI18nJsonSelection(lookup.localeSelection)
  const rows = await db
    .select({
      snapshotId: address2d.snapshotId,
      divisionSnapshotId: address2d.divisionSnapshotId,
      id: address2d.id,
      geometry: address2d.geometry,
      bbox: address2d.bbox,
      identifiers: address2d.identifiers,
      sources: address2d.sources,
      parentAddressId: address2d.parentAddressId,
      granularity: address2d.granularity,
      countryId: address2d.countryId,
      areaId: address2d.areaId,
      districtId: address2d.districtId,
      townId: address2d.townId,
      macrohoodId: address2d.macrohoodId,
      neighbourhoodId: address2d.neighbourhoodId,
      microhoodId: address2d.microhoodId,
      villageId: address2d.villageId,
      hamletId: address2d.hamletId,
      createdAt: address2d.createdAt,
      updatedAt: address2d.updatedAt,
      i18n,
    })
    .from(address2d)
    .where(
      and(
        ...buildAddressConditions(lookup),
        lookup.after === undefined ? undefined : sql`${address2d.id} > ${lookup.after}`,
      ),
    )
    .orderBy(asc(address2d.id))
    .limit(lookup.limit ?? 25)
    .offset(lookup.offset ?? 0)
    .all()

  return rows.map(row => mapAddressRow(row as AddressRow))
}

/** JSON membership keeps hydration bounded independently of the number of IDs.
 */
export async function listAddressRecordsCurrentByIds(
  db: CurrentDatabase,
  lookup: Omit<AddressListLookup, 'limit' | 'offset'> & { addressIds: string[] },
): Promise<AddressRecord[]> {
  if (lookup.addressIds.length === 0) return []

  const i18n = buildAddressI18nJsonSelection(lookup.localeSelection)
  const rows = await db
    .select({
      snapshotId: address2d.snapshotId,
      divisionSnapshotId: address2d.divisionSnapshotId,
      id: address2d.id,
      geometry: address2d.geometry,
      bbox: address2d.bbox,
      identifiers: address2d.identifiers,
      sources: address2d.sources,
      parentAddressId: address2d.parentAddressId,
      granularity: address2d.granularity,
      countryId: address2d.countryId,
      areaId: address2d.areaId,
      districtId: address2d.districtId,
      townId: address2d.townId,
      macrohoodId: address2d.macrohoodId,
      neighbourhoodId: address2d.neighbourhoodId,
      microhoodId: address2d.microhoodId,
      villageId: address2d.villageId,
      hamletId: address2d.hamletId,
      createdAt: address2d.createdAt,
      updatedAt: address2d.updatedAt,
      i18n,
    })
    .from(address2d)
    .where(
      and(
        ...buildAddressConditions(lookup),
        sql`${address2d.id} in (select value from json_each(${JSON.stringify(lookup.addressIds)}))`,
      ),
    )
    .all()

  const recordsById = new Map(
    rows.map(row => [row.id, mapAddressRow(row as AddressRow)]),
  )
  return lookup.addressIds.flatMap(addressId => {
    const record = recordsById.get(addressId)
    return record ? [record] : []
  })
}

export async function searchAddressIdsCurrent(
  db: CurrentDatabase,
  lookup: AddressSearchLookup,
): Promise<{ addressIds: string[]; total: number }> {
  if (lookup.snapshotIds.length === 0) return { addressIds: [], total: 0 }
  if (lookup.mode === 'exact' || lookup.mode === 'range') {
    const buildingNumber = normaliseAddressSearchNumber(lookup.query)
    if (!buildingNumber) return { addressIds: [], total: 0 }

    const conditions = and(
      eq(address2dBuildingNumberLookup.buildingNumber, buildingNumber),
      lookup.mode === 'exact'
        ? ne(address2dBuildingNumberLookup.evidence, 'derived_member')
        : undefined,
      ...buildAddressConditions(lookup),
    )
    const [rows, countRow] = await Promise.all([
      db
        .selectDistinct({ addressId: address2dBuildingNumberLookup.addressId })
        .from(address2dBuildingNumberLookup)
        .innerJoin(
          address2d,
          and(
            eq(address2d.snapshotId, address2dBuildingNumberLookup.snapshotId),
            eq(address2d.id, address2dBuildingNumberLookup.addressId),
          ),
        )
        .where(conditions)
        .orderBy(asc(address2dBuildingNumberLookup.addressId))
        .limit(lookup.limit)
        .offset(lookup.offset)
        .all(),
      db
        .select({
          count: sql<number>`count(distinct ${address2dBuildingNumberLookup.addressId})`,
        })
        .from(address2dBuildingNumberLookup)
        .innerJoin(
          address2d,
          and(
            eq(address2d.snapshotId, address2dBuildingNumberLookup.snapshotId),
            eq(address2d.id, address2dBuildingNumberLookup.addressId),
          ),
        )
        .where(conditions)
        .get(),
    ])
    return {
      addressIds: [...new Set(rows.map(row => row.addressId))],
      total: Number(countRow?.count ?? 0),
    }
  }

  const ftsQuery = buildAddressFtsQuery(lookup)
  if (!ftsQuery) return { addressIds: [], total: 0 }
  try {
    const scopes = await db
      .select({ snapshotId: addressSearchScopes.snapshotId })
      .from(addressSearchScopes)
      .all()
    if (lookup.snapshotIds.some(id => !scopes.some(scope => scope.snapshotId === id)))
      throw new Error('FTS index is not initialised for the selected latest snapshots.')
    const conditions = and(
      addressesFtsMatch(ftsQuery),
      ...buildAddressConditions(lookup),
    )
    const [rows, countRow] = await Promise.all([
      db
        .selectDistinct({ addressId: addressesFts.addressId })
        .from(addressesFts)
        .innerJoin(
          addressSearchScopes,
          eq(addressSearchScopes.scopeId, addressesFts.scopeId),
        )
        .innerJoin(
          address2d,
          and(
            eq(address2d.snapshotId, addressSearchScopes.snapshotId),
            eq(address2d.id, addressesFts.addressId),
          ),
        )
        .where(conditions)
        .orderBy(asc(addressesFts.addressId))
        .limit(lookup.limit)
        .offset(lookup.offset)
        .all(),
      db
        .select({ count: sql<number>`count(distinct ${addressesFts.addressId})` })
        .from(addressesFts)
        .innerJoin(
          addressSearchScopes,
          eq(addressSearchScopes.scopeId, addressesFts.scopeId),
        )
        .innerJoin(
          address2d,
          and(
            eq(address2d.snapshotId, addressSearchScopes.snapshotId),
            eq(address2d.id, addressesFts.addressId),
          ),
        )
        .where(conditions)
        .get(),
    ])
    return {
      addressIds: rows.map(row => row.addressId),
      total: Number(countRow?.count ?? 0),
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table: (addressesFts|addressSearchFts|addressSearchScopes)/.test(
        error.message,
      )
    ) {
      throw new Error(
        'FTS index is not initialised. Rebuild addressesFts before using search.',
      )
    }
    throw error
  }
}

export function normaliseAddressSearchNumber(value: string) {
  const normalised = value.normalize('NFKC').trim().toLocaleUpperCase('en')
  return /^\d+[A-Z]?$/.test(normalised) ? normalised : null
}

export function buildAddressFtsQuery(
  lookup: Pick<AddressSearchLookup, 'component' | 'mode' | 'query'>,
) {
  const tokens = lookup.query
    .normalize('NFKC')
    .trim()
    .split(/[\s,;，、]+/u)
    // FTS5 recognises its operators only in uppercase. Lowercasing after
    // stripping syntax leaves caller text as literal token input.
    .map(token => token.replaceAll(/[^\p{L}\p{N}]+/gu, '').toLocaleLowerCase('en'))
    .filter(Boolean)
  if (tokens.length === 0) return null

  const suffix = lookup.mode === 'prefix' ? '*' : ''
  const terms = tokens.map(token => {
    const aliases = ADDRESS_FTS_TOKEN_ALIASES.get(token) ?? [token]
    const terms = aliases.map(alias => `${alias}${suffix}`)
    return terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`
  })
  const query = terms.join(' AND ')
  if (lookup.mode !== 'component') return query

  const column = lookup.component ? addressFtsColumn(lookup.component) : null
  return column ? `${column} : (${query})` : null
}

function addressFtsColumn(component: AddressSearchComponent) {
  return {
    block: 'blockExpression',
    building: 'buildingName',
    estate: 'estateName',
    formatted: 'formattedAddress',
    number: 'buildingNumber',
    phase: 'phaseExpression',
    street: 'streetName',
  }[component]
}

export async function countAddressRecordsCurrent(
  db: CurrentDatabase,
  lookup: Omit<AddressListLookup, 'limit' | 'offset' | 'localeSelection'>,
) {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(address2d)
    .where(and(...buildAddressConditions(lookup)))
    .limit(1)
    .get()

  return Number(row?.count ?? 0)
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : value === null ? null : undefined
}

function asNullableBlockType(value: unknown): AddressBlockType | null | undefined {
  const text = asNullableString(value)
  return text == null
    ? text
    : addressBlockTypes.includes(text as AddressBlockType)
      ? (text as AddressBlockType)
      : undefined
}

function asNullableBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (value === 1) return true
  if (value === 0) return false
  return value === null ? null : undefined
}
