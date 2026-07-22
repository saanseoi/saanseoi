import type { CurrentDatabase } from '@repo/db'
import { and, asc, eq, inArray, sql } from '@repo/db'
import { currentSchema } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core'

const { address2d, address2dI18n } = currentSchema

export type AddressLocaleValue = {
  formattedAddress: string
  buildingName?: string | null
  buildingNumberExpression?: string | null
  buildingNumberFrom?: string | null
  buildingNumberTo?: string | null
  buildingNumberConnector?: string | null
  blockExpression?: string | null
  blockType?: string | null
  blockRef?: string | null
  blockTypeBeforeNumber?: boolean | null
  phaseExpression?: string | null
  phaseName?: string | null
  phaseRef?: string | null
  estateName?: string | null
  streetName?: string | null
}

export type AddressRecord = {
  address: {
    snapshotId: string
    id: string
    geometry: unknown
    bbox: unknown
    identifiers: unknown
    sources: unknown
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
  snapshotId: string
  addressId: string
  localeSelection: RequestedApiLocaleSelection
}

type AddressListLookup = {
  snapshotId: string
  limit?: number
  offset?: number
  countryId?: string
  areaId?: string
  districtId?: string
  localeSelection: RequestedApiLocaleSelection
}

type AddressRow = {
  snapshotId: string
  id: string
  geometry: typeof address2d.$inferSelect.geometry
  bbox: typeof address2d.$inferSelect.bbox
  identifiers: typeof address2d.$inferSelect.identifiers
  sources: typeof address2d.$inferSelect.sources
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
      ? inArray(address2dI18n.locale, localeSelection.locales)
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
            blockType: asNullableString(record.blockType),
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
      id: row.id,
      geometry: row.geometry,
      bbox: row.bbox,
      identifiers: row.identifiers,
      sources: row.sources,
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
  lookup: Pick<AddressListLookup, 'snapshotId' | 'countryId' | 'areaId' | 'districtId'>,
) {
  return [
    eq(address2d.snapshotId, lookup.snapshotId),
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
      id: address2d.id,
      geometry: address2d.geometry,
      bbox: address2d.bbox,
      identifiers: address2d.identifiers,
      sources: address2d.sources,
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
        eq(address2d.snapshotId, lookup.snapshotId),
        eq(address2d.id, lookup.addressId),
      ),
    )
    .limit(1)
    .get()

  return row ? mapAddressRow(row as AddressRow) : null
}

export async function listAddressRecordsCurrent(
  db: CurrentDatabase,
  lookup: AddressListLookup,
): Promise<AddressRecord[]> {
  const i18n = buildAddressI18nJsonSelection(lookup.localeSelection)
  const rows = await db
    .select({
      snapshotId: address2d.snapshotId,
      id: address2d.id,
      geometry: address2d.geometry,
      bbox: address2d.bbox,
      identifiers: address2d.identifiers,
      sources: address2d.sources,
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
    .where(and(...buildAddressConditions(lookup)))
    .orderBy(asc(address2d.id))
    .limit(lookup.limit ?? 25)
    .offset(lookup.offset ?? 0)
    .all()

  return rows.map(row => mapAddressRow(row as AddressRow))
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

function asNullableBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (value === 1) return true
  if (value === 0) return false
  return value === null ? null : undefined
}
