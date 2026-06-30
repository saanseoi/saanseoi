import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
  waitForDatasetRecord,
} from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'
import type { CurrentAddressVersionRow } from '@repo/db/historySchema'
import { currentSchema, historySchema } from '@repo/db'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runWithWriteRetry,
} from '../utils'

const CURRENT_ADDRESS2D_COLUMN_COUNT = 20
const CURRENT_ADDRESS2D_I18N_COLUMN_COUNT = 17
const HISTORY_ADDRESS2D_VERSION_COLUMN_COUNT = 26
const HISTORY_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = 22
const HISTORY_ADDRESS2D_VERSION_UPSERT_FIXED_VARIABLE_COUNT = 7
const SEEN_ADDRESS_ID_INSERT_COLUMN_COUNT = 1

const tempSeenAddressIds = sqliteTable('tempSeenAddressIds', {
  id: text('id').primaryKey(),
})

export type AddressBaseRecord = AddressRow
export type AddressI18nRecord = NewAddressI18nRow

export type AddressVersionSnapshot = {
  churnHash: string
  id: string
  localizedRows: AddressI18nPayload[]
  matchKey: string | null
  versionHash: string
}

export type AddressCurrentMatchInput = {
  districtId: string | null
  streetName: string | null
  streetNumber: string | null
}

export type CurrentAddressVersionLookupResult = {
  byId: Map<string, AddressVersionSnapshot>
  byMatchKey: Map<string, AddressVersionSnapshot>
}

type AddressHashInput = Omit<
  AddressRow,
  'snapshotId' | 'createdAt' | 'updatedAt' | 'divisionSnapshotId' | 'streetSnapshotId'
>

type CurrentAddressVersionLookupRow = Pick<
  CurrentAddressVersionRow,
  | 'areaId'
  | 'bbox'
  | 'countryId'
  | 'districtId'
  | 'geometry'
  | 'hamletId'
  | 'id'
  | 'identifiers'
  | 'macrohoodId'
  | 'microhoodId'
  | 'neighbourhoodId'
  | 'sources'
  | 'streetId'
  | 'townId'
  | 'versionHash'
  | 'villageId'
>

export type AddressVersionInsertContext = {
  regionCode: RegionCode
  releaseId: string
  releaseRole: 'primary' | 'enrichment'
  snapshotId: string
  cohortKey: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

type RawSqlWritableDb = {
  run(statement: unknown): unknown | Promise<unknown>
}

function runRawSql(db: HarbourWritableDb, statement: unknown) {
  return runWithWriteRetry(() => (db as unknown as RawSqlWritableDb).run(statement))
}

function selectCurrentAddressVersionFields() {
  return {
    id: historySchema.address2dVersions.id,
    streetId: historySchema.address2dVersions.streetId,
    hamletId: historySchema.address2dVersions.hamletId,
    microhoodId: historySchema.address2dVersions.microhoodId,
    villageId: historySchema.address2dVersions.villageId,
    neighbourhoodId: historySchema.address2dVersions.neighbourhoodId,
    macrohoodId: historySchema.address2dVersions.macrohoodId,
    townId: historySchema.address2dVersions.townId,
    districtId: historySchema.address2dVersions.districtId,
    areaId: historySchema.address2dVersions.areaId,
    countryId: historySchema.address2dVersions.countryId,
    geometry: historySchema.address2dVersions.geometry,
    identifiers: historySchema.address2dVersions.identifiers,
    bbox: historySchema.address2dVersions.bbox,
    sources: historySchema.address2dVersions.sources,
    versionHash: historySchema.address2dVersions.versionHash,
  }
}

function normalizeAddressMatchToken(value: string | null) {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalized || null
}

export async function getCurrentAddressVersionMap(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  options: {
    buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
    buildMatchKey: (input: {
      districtId: string | null
      streetNumber: string | null
      streetName: string | null
    }) => string | null
    normalizeAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
) {
  const versionRows = (await db
    .select(selectCurrentAddressVersionFields())
    .from(historySchema.address2dVersions)
    .where(
      and(
        eq(historySchema.address2dVersions.isCurrent, true),
        eq(historySchema.address2dVersions.regionCode, regionCode),
      ),
    )
    .all()) as CurrentAddressVersionLookupRow[]

  return buildCurrentAddressVersionSnapshotMap(db, versionRows, options)
}

export async function getCurrentAddressVersionLookup(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  addressIds: string[],
  matchInputs: AddressCurrentMatchInput[],
  options: {
    buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
    buildMatchKey: (input: AddressCurrentMatchInput) => string | null
    normalizeAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
): Promise<CurrentAddressVersionLookupResult> {
  const byIdRows: CurrentAddressVersionLookupRow[] = []

  for (const idChunk of chunkArray(
    [...new Set(addressIds)],
    getMaxItemsPerInClause(1, 2),
  )) {
    if (idChunk.length === 0) {
      continue
    }

    byIdRows.push(
      ...((await db
        .select(selectCurrentAddressVersionFields())
        .from(historySchema.address2dVersions)
        .where(
          and(
            eq(historySchema.address2dVersions.isCurrent, true),
            eq(historySchema.address2dVersions.regionCode, regionCode),
            inArray(historySchema.address2dVersions.id, idChunk),
          ),
        )
        .all()) as CurrentAddressVersionLookupRow[]),
    )
  }

  const matchRows: CurrentAddressVersionLookupRow[] = []
  const uniqueMatchInputs = new Map<
    string,
    {
      districtId: string
      streetName: string
      streetNumber: string
    }
  >()

  for (const input of matchInputs) {
    const districtId = input.districtId
    const streetNumber = normalizeAddressMatchToken(input.streetNumber)
    const streetName = normalizeAddressMatchToken(input.streetName)

    if (!districtId || !streetNumber || !streetName) {
      continue
    }

    uniqueMatchInputs.set(`${districtId}\0${streetNumber}\0${streetName}`, {
      districtId,
      streetName,
      streetNumber,
    })
  }

  for (const inputChunk of chunkArray([...uniqueMatchInputs.values()], 24)) {
    if (inputChunk.length === 0) {
      continue
    }

    const predicates = inputChunk.map(input =>
      and(
        eq(historySchema.address2dVersions.districtId, input.districtId),
        sql`upper(trim(${historySchema.address2dVersionsI18n.streetNumber})) = ${
          input.streetNumber
        }`,
        sql`upper(trim(${historySchema.address2dVersionsI18n.streetName})) = ${
          input.streetName
        }`,
      ),
    )

    matchRows.push(
      ...((await db
        .select(selectCurrentAddressVersionFields())
        .from(historySchema.address2dVersions)
        .innerJoin(
          historySchema.address2dVersionsI18n,
          and(
            eq(
              historySchema.address2dVersions.id,
              historySchema.address2dVersionsI18n.addressId,
            ),
            eq(historySchema.address2dVersionsI18n.isCurrent, true),
            eq(historySchema.address2dVersionsI18n.locale, 'en'),
          ),
        )
        .where(
          and(
            eq(historySchema.address2dVersions.isCurrent, true),
            eq(historySchema.address2dVersions.regionCode, regionCode),
            or(...predicates),
          ),
        )
        .all()) as CurrentAddressVersionLookupRow[]),
    )
  }

  const snapshots = await buildCurrentAddressVersionSnapshotMap(
    db,
    [...byIdRows, ...matchRows],
    options,
  )
  const byMatchKey = new Map<string, AddressVersionSnapshot>()

  for (const snapshot of snapshots.values()) {
    if (snapshot.matchKey && !byMatchKey.has(snapshot.matchKey)) {
      byMatchKey.set(snapshot.matchKey, snapshot)
    }
  }

  return {
    byId: snapshots,
    byMatchKey,
  }
}

export async function hasCurrentAddressVersions(
  db: HarbourReadableDb,
  regionCode: RegionCode,
) {
  const row = await db
    .select({
      id: historySchema.address2dVersions.id,
    })
    .from(historySchema.address2dVersions)
    .where(
      and(
        eq(historySchema.address2dVersions.isCurrent, true),
        eq(historySchema.address2dVersions.regionCode, regionCode),
      ),
    )
    .limit(1)
    .get()

  return Boolean(row)
}

export async function prepareSeenAddressIdTable(db: HarbourWritableDb) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenAddressIds`)
  await runRawSql(db, sql`CREATE TEMP TABLE tempSeenAddressIds (id TEXT PRIMARY KEY)`)
}

export async function insertSeenAddressIds(
  db: HarbourWritableDb,
  addressIds: string[],
) {
  const uniqueIds = [...new Set(addressIds)]

  if (uniqueIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    uniqueIds,
    getMaxRowsPerInsert(SEEN_ADDRESS_ID_INSERT_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(tempSeenAddressIds)
        .values(chunk.map(id => ({ id })))
        .onConflictDoNothing()
        .run(),
    )
  }
}

export async function dropSeenAddressIdTable(db: HarbourWritableDb) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenAddressIds`)
}

async function buildCurrentAddressVersionSnapshotMap(
  db: HarbourReadableDb,
  versionRows: CurrentAddressVersionLookupRow[],
  options: {
    buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
    buildMatchKey: (input: AddressCurrentMatchInput) => string | null
    normalizeAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
) {
  const rows = [...new Map(versionRows.map(row => [row.id, row])).values()]

  if (rows.length === 0) {
    return new Map<string, AddressVersionSnapshot>()
  }

  const i18nRows: AddressI18nPayload[] = []
  const addressIds = rows.map(row => row.id)

  for (const addressIdChunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 1))) {
    const chunkRows = (await db
      .select({
        addressId: historySchema.address2dVersionsI18n.addressId,
        locale: historySchema.address2dVersionsI18n.locale,
        formattedAddress: historySchema.address2dVersionsI18n.formattedAddress,
        buildingName: historySchema.address2dVersionsI18n.buildingName,
        buildingNumberFrom: historySchema.address2dVersionsI18n.buildingNumberFrom,
        buildingNumberTo: historySchema.address2dVersionsI18n.buildingNumberTo,
        blockType: historySchema.address2dVersionsI18n.blockType,
        blockNumber: historySchema.address2dVersionsI18n.blockNumber,
        blockTypeBeforeNumber:
          historySchema.address2dVersionsI18n.blockTypeBeforeNumber,
        phaseName: historySchema.address2dVersionsI18n.phaseName,
        phaseNumber: historySchema.address2dVersionsI18n.phaseNumber,
        estateName: historySchema.address2dVersionsI18n.estateName,
        streetNumber: historySchema.address2dVersionsI18n.streetNumber,
        streetName: historySchema.address2dVersionsI18n.streetName,
      })
      .from(historySchema.address2dVersionsI18n)
      .where(
        and(
          inArray(historySchema.address2dVersionsI18n.addressId, addressIdChunk),
          eq(historySchema.address2dVersionsI18n.isCurrent, true),
        ),
      )
      .all()) as AddressI18nPayload[]

    i18nRows.push(...chunkRows)
  }

  const i18nByAddressId = new Map<string, AddressI18nPayload[]>()

  for (const row of i18nRows) {
    const rowsForAddress = i18nByAddressId.get(row.addressId) ?? []
    rowsForAddress.push(row)
    i18nByAddressId.set(row.addressId, rowsForAddress)
  }

  const snapshots: Array<readonly [string, AddressVersionSnapshot]> = []

  for (const row of rows) {
    const localizedRows = [...(i18nByAddressId.get(row.id) ?? [])]
      .map(options.normalizeAddressI18nSnapshotRow)
      .sort((left, right) => left.locale.localeCompare(right.locale))

    snapshots.push([
      row.id,
      {
        churnHash: await createHash({
          base: options.buildAddressBaseHashInput(row),
          i18n: localizedRows,
        }),
        id: row.id,
        localizedRows,
        matchKey: options.buildMatchKey({
          districtId: row.districtId,
          streetNumber:
            localizedRows.find(localized => localized.locale === 'en')?.streetNumber ??
            null,
          streetName:
            localizedRows.find(localized => localized.locale === 'en')?.streetName ??
            null,
        }),
        versionHash: row.versionHash,
      } satisfies AddressVersionSnapshot,
    ])
  }

  return new Map(snapshots)
}

export async function prepareAddressVersionInsertContext(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
): Promise<AddressVersionInsertContext> {
  const dataset = await waitForDatasetRecord(metaDb, {
    releaseCode: message.releaseCode,
    releaseId: message.releaseId ?? message.datasetId,
  })

  if (!dataset) {
    throw new Error(
      `Release not found: ${message.releaseId ?? message.releaseCode ?? message.datasetId}`,
    )
  }

  const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'address', {
    regionCode: dataset.regionCode,
    cohortKey: dataset.cohortKey,
  })

  const year = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForTypeRegionYear(
    metaDb,
    'history',
    environment,
    message.regionCode,
    year,
  )

  if (!currentShard || !historyShard) {
    throw new Error(
      `Shard mapping not found for ${message.regionCode}/${year} in ${environment}.`,
    )
  }

  const releaseRole = dataset.source === 'hkgov-als' ? 'primary' : 'enrichment'

  await upsertSnapshotSource(
    metaDb,
    snapshot.id,
    dataset.datasetId,
    dataset.releaseId,
    releaseRole,
    {
      anchorReleaseId: releaseRole === 'primary' ? dataset.releaseId : null,
      selectedByRule: 'snapshot-assembly-address-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: dataset.cohortKey,
    },
  )
  await recordSnapshotAssemblyRun(metaDb, {
    snapshotId: snapshot.id,
    resourceType: 'address',
    anchorReleaseId: releaseRole === 'primary' ? dataset.releaseId : null,
    anchorCohortKey: dataset.cohortKey,
    selectionSummaryJson: {
      releaseRole,
      sourceReleaseId: dataset.releaseId,
      sourceVersion: dataset.sourceVersion,
    },
  })
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)

  return {
    regionCode: message.regionCode,
    releaseId: dataset.releaseId,
    releaseRole,
    snapshotId: snapshot.id,
    cohortKey: message.cohortKey,
  }
}

export async function cloneAddressCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  fromSnapshotId: string,
  toSnapshotId: string,
) {
  if (fromSnapshotId === toSnapshotId) {
    return
  }

  const now = new Date().toISOString()

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2d)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            id: currentSchema.address2d.id,
            geometry: currentSchema.address2d.geometry,
            bbox: currentSchema.address2d.bbox,
            divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
            countryId: currentSchema.address2d.countryId,
            areaId: currentSchema.address2d.areaId,
            districtId: currentSchema.address2d.districtId,
            townId: currentSchema.address2d.townId,
            macrohoodId: currentSchema.address2d.macrohoodId,
            villageId: currentSchema.address2d.villageId,
            neighbourhoodId: currentSchema.address2d.neighbourhoodId,
            hamletId: currentSchema.address2d.hamletId,
            microhoodId: currentSchema.address2d.microhoodId,
            streetSnapshotId: currentSchema.address2d.streetSnapshotId,
            streetId: currentSchema.address2d.streetId,
            identifiers: currentSchema.address2d.identifiers,
            sources: currentSchema.address2d.sources,
            createdAt: sql<string>`${now}`,
            updatedAt: sql<string>`${now}`,
          })
          .from(currentSchema.address2d)
          .where(eq(currentSchema.address2d.snapshotId, fromSnapshotId)),
      )
      .onConflictDoNothing()
      .run(),
  )

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2dI18n)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            addressId: currentSchema.address2dI18n.addressId,
            locale: currentSchema.address2dI18n.locale,
            formattedAddress: currentSchema.address2dI18n.formattedAddress,
            buildingName: currentSchema.address2dI18n.buildingName,
            buildingNumberFrom: currentSchema.address2dI18n.buildingNumberFrom,
            buildingNumberTo: currentSchema.address2dI18n.buildingNumberTo,
            blockType: currentSchema.address2dI18n.blockType,
            blockNumber: currentSchema.address2dI18n.blockNumber,
            blockTypeBeforeNumber: currentSchema.address2dI18n.blockTypeBeforeNumber,
            phaseName: currentSchema.address2dI18n.phaseName,
            phaseNumber: currentSchema.address2dI18n.phaseNumber,
            estateName: currentSchema.address2dI18n.estateName,
            streetNumber: currentSchema.address2dI18n.streetNumber,
            streetName: currentSchema.address2dI18n.streetName,
            createdAt: sql<string>`${now}`,
            updatedAt: sql<string>`${now}`,
          })
          .from(currentSchema.address2dI18n)
          .where(eq(currentSchema.address2dI18n.snapshotId, fromSnapshotId)),
      )
      .onConflictDoNothing()
      .run(),
  )
}

export async function alignAddressCurrentDivisionSnapshot(
  db: HarbourWritableDb,
  snapshotId: string,
  divisionSnapshotId: string,
) {
  await runWithWriteRetry(() =>
    db
      .update(currentSchema.address2d)
      .set({
        divisionSnapshotId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(currentSchema.address2d.snapshotId, snapshotId))
      .run(),
  )
}

export async function closeCurrentAddressVersions(
  db: HarbourWritableDb,
  addressIds: string[],
  snapshotId: string,
  cohortKey: string,
) {
  if (addressIds.length === 0) {
    return
  }

  const now = new Date().toISOString()

  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      db
        .update(historySchema.address2dVersions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dVersions.isCurrent, true),
            inArray(historySchema.address2dVersions.id, chunk),
          ),
        )
        .run(),
    )
  }
}

export async function deleteMissingCurrentAddresses(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  currentRows: Map<string, AddressVersionSnapshot>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return {
      count: 0,
      missingIds,
    }
  }

  const now = new Date().toISOString()

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dVersions.isCurrent, true),
            inArray(historySchema.address2dVersions.id, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersionsI18n)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dVersionsI18n.isCurrent, true),
            inArray(historySchema.address2dVersionsI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

export async function deleteMissingCurrentAddressesBySeenIds(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  regionCode: RegionCode,
  seenIds: Set<string>,
) {
  const missingIds: string[] = []
  let lastId = ''

  while (true) {
    const rows = (await historyDb
      .select({
        id: historySchema.address2dVersions.id,
      })
      .from(historySchema.address2dVersions)
      .where(
        and(
          eq(historySchema.address2dVersions.isCurrent, true),
          eq(historySchema.address2dVersions.regionCode, regionCode),
          gt(historySchema.address2dVersions.id, lastId),
        ),
      )
      .orderBy(historySchema.address2dVersions.id)
      .limit(500)
      .all()) as Array<{ id: string }>

    if (rows.length === 0) {
      break
    }

    const pageMissingIds = rows.map(row => row.id).filter(id => !seenIds.has(id))

    if (pageMissingIds.length > 0) {
      await closeMissingCurrentAddressRows(
        historyDb,
        snapshotId,
        cohortKey,
        pageMissingIds,
      )
      missingIds.push(...pageMissingIds)
    }

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastId = lastRow.id
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

export async function deleteMissingCurrentAddressesBySeenTable(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  regionCode: RegionCode,
) {
  const missingIds: string[] = []
  let lastId = ''

  while (true) {
    const rows = (await historyDb
      .select({
        id: historySchema.address2dVersions.id,
      })
      .from(historySchema.address2dVersions)
      .where(
        and(
          eq(historySchema.address2dVersions.isCurrent, true),
          eq(historySchema.address2dVersions.regionCode, regionCode),
          gt(historySchema.address2dVersions.id, lastId),
          sql`NOT EXISTS (
            SELECT 1
            FROM tempSeenAddressIds seen
            WHERE seen.id = ${historySchema.address2dVersions.id}
          )`,
        ),
      )
      .orderBy(historySchema.address2dVersions.id)
      .limit(500)
      .all()) as Array<{ id: string }>

    if (rows.length === 0) {
      break
    }

    const pageMissingIds = rows.map(row => row.id)

    await closeMissingCurrentAddressRows(
      historyDb,
      snapshotId,
      cohortKey,
      pageMissingIds,
    )
    missingIds.push(...pageMissingIds)

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastId = lastRow.id
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

async function closeMissingCurrentAddressRows(
  historyDb: HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  missingIds: string[],
) {
  const now = new Date().toISOString()

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dVersions.isCurrent, true),
            inArray(historySchema.address2dVersions.id, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersionsI18n)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dVersionsI18n.isCurrent, true),
            inArray(historySchema.address2dVersionsI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }
}

export async function deleteStaleAddressCurrentRows(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  staleIds: string[],
) {
  if (staleIds.length === 0) {
    return 0
  }

  await deleteAddressCurrentRowsByIds(db, snapshotId, staleIds)

  return staleIds.length
}

export async function upsertAddressCurrentStates(
  db: HarbourWritableDb,
  rows: AddressBaseRecord[],
) {
  if (rows.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(CURRENT_ADDRESS2D_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(currentSchema.address2d)
        .values(chunk)
        .onConflictDoUpdate({
          target: [currentSchema.address2d.snapshotId, currentSchema.address2d.id],
          set: {
            divisionSnapshotId: excluded('divisionSnapshotId'),
            streetSnapshotId: excluded('streetSnapshotId'),
            streetId: excluded('streetId'),
            hamletId: excluded('hamletId'),
            microhoodId: excluded('microhoodId'),
            villageId: excluded('villageId'),
            neighbourhoodId: excluded('neighbourhoodId'),
            macrohoodId: excluded('macrohoodId'),
            townId: excluded('townId'),
            districtId: excluded('districtId'),
            areaId: excluded('areaId'),
            countryId: excluded('countryId'),
            geometry: excluded('geometry'),
            identifiers: excluded('identifiers'),
            bbox: excluded('bbox'),
            sources: excluded('sources'),
            updatedAt: excluded('updatedAt'),
          },
        })
        .run(),
    )
  }
}

export async function replaceAddressCurrentI18n(
  db: HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
  rows: NewAddressI18nRow[],
) {
  if (addressIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause())) {
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2dI18n)
        .where(
          and(
            eq(currentSchema.address2dI18n.snapshotId, snapshotId),
            inArray(currentSchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  if (rows.length > 0) {
    await insertAddressI18nInChunks(db, rows)
  }
}

async function deleteAddressCurrentRowsByIds(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
) {
  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 2))) {
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2dI18n)
        .where(
          and(
            eq(currentSchema.address2dI18n.snapshotId, snapshotId),
            inArray(currentSchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2d)
        .where(
          and(
            eq(currentSchema.address2d.snapshotId, snapshotId),
            inArray(currentSchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
  }
}

export async function insertAddressVersionRows(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  context: AddressVersionInsertContext,
  baseRows: Array<
    AddressBaseRecord & {
      versionHash: string
    }
  >,
  i18nRows: Array<
    AddressI18nPayload & {
      sourceReleaseId: string
      snapshotId: string
      validFromSnapshotId: string
      validToSnapshotId: string | null
      isCurrent: boolean
      versionHash: string
      createdAt: string
      updatedAt: string
    }
  >,
) {
  if (baseRows.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    baseRows,
    getMaxRowsPerInsert(
      HISTORY_ADDRESS2D_VERSION_COLUMN_COUNT,
      HISTORY_ADDRESS2D_VERSION_UPSERT_FIXED_VARIABLE_COUNT,
    ),
  )) {
    await runWithWriteRetry(() =>
      historyDb
        .insert(historySchema.address2dVersions)
        .values(
          chunk.map(row => ({
            id: row.id,
            regionCode: context.regionCode,
            versionHash: row.versionHash,
            sourceReleaseId: context.releaseId,
            snapshotId: context.snapshotId,
            validFromSnapshotId: context.snapshotId,
            validToSnapshotId: null,
            validFromCohortKey: context.cohortKey,
            validToCohortKey: null,
            isCurrent: true,
            streetId: row.streetId,
            hamletId: row.hamletId,
            microhoodId: row.microhoodId,
            villageId: row.villageId,
            neighbourhoodId: row.neighbourhoodId,
            macrohoodId: row.macrohoodId,
            townId: row.townId,
            districtId: row.districtId,
            areaId: row.areaId,
            countryId: row.countryId,
            geometry: row.geometry,
            bbox: row.bbox,
            identifiers: row.identifiers,
            sources: row.sources,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            historySchema.address2dVersions.id,
            historySchema.address2dVersions.versionHash,
          ],
          set: {
            isCurrent: true,
            sourceReleaseId: context.releaseId,
            snapshotId: context.snapshotId,
            validFromSnapshotId: context.snapshotId,
            validFromCohortKey: context.cohortKey,
            validToSnapshotId: null,
            validToCohortKey: null,
            updatedAt: excluded('updatedAt'),
          },
        })
        .run(),
    )
  }

  if (i18nRows.length > 0) {
    await insertAddressVersionsI18nInChunks(historyDb, i18nRows)
  }
}

async function insertAddressI18nInChunks(
  db: HarbourWritableDb,
  rows: NewAddressI18nRow[],
) {
  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(CURRENT_ADDRESS2D_I18N_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db.insert(currentSchema.address2dI18n).values(chunk).run(),
    )
  }
}

async function insertAddressVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<
    AddressI18nPayload & {
      sourceReleaseId: string
      snapshotId: string
      validFromSnapshotId: string
      validToSnapshotId: string | null
      isCurrent: boolean
      versionHash: string
      createdAt: string
      updatedAt: string
    }
  >,
) {
  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(HISTORY_ADDRESS2D_I18N_VERSION_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(historySchema.address2dVersionsI18n)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            historySchema.address2dVersionsI18n.addressId,
            historySchema.address2dVersionsI18n.versionHash,
            historySchema.address2dVersionsI18n.locale,
          ],
          set: {
            sourceReleaseId: excluded('sourceReleaseId'),
            snapshotId: excluded('snapshotId'),
            validFromSnapshotId: excluded('validFromSnapshotId'),
            validToSnapshotId: null,
            isCurrent: true,
            formattedAddress: excluded('formattedAddress'),
            buildingName: excluded('buildingName'),
            buildingNumberFrom: excluded('buildingNumberFrom'),
            buildingNumberTo: excluded('buildingNumberTo'),
            blockType: excluded('blockType'),
            blockNumber: excluded('blockNumber'),
            blockTypeBeforeNumber: excluded('blockTypeBeforeNumber'),
            phaseName: excluded('phaseName'),
            phaseNumber: excluded('phaseNumber'),
            estateName: excluded('estateName'),
            streetNumber: excluded('streetNumber'),
            streetName: excluded('streetName'),
            updatedAt: excluded('updatedAt'),
          },
        })
        .run(),
    )
  }
}
