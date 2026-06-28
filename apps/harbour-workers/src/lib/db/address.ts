import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  getDatasetRecordByReleaseId,
  resolveShardForKindRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
} from '@repo/core/db/meta-repository'
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

export type AddressBaseRecord = AddressRow
export type AddressI18nRecord = NewAddressI18nRow

export type AddressVersionSnapshot = {
  churnHash: string
  id: string
  localizedRows: AddressI18nPayload[]
  matchKey: string | null
  versionHash: string
}

type AddressHashInput = Omit<
  AddressRow,
  'snapshotId' | 'createdAt' | 'updatedAt' | 'divisionSnapshotId' | 'streetSnapshotId'
>

export type AddressVersionInsertContext = {
  regionCode: RegionCode
  releaseId: string
  releaseRole: 'primary' | 'enrichment'
  snapshotId: string
  snapshotMonth: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
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
    .select({
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
    })
    .from(historySchema.address2dVersions)
    .where(
      and(
        eq(historySchema.address2dVersions.isCurrent, true),
        eq(historySchema.address2dVersions.regionCode, regionCode),
      ),
    )
    .all()) as CurrentAddressVersionRow[]

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

  const snapshots = await Promise.all(
    rows.map(async row => {
      const localizedRows = [...(i18nByAddressId.get(row.id) ?? [])]
        .map(options.normalizeAddressI18nSnapshotRow)
        .sort((left, right) => left.locale.localeCompare(right.locale))

      return [
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
              localizedRows.find(localized => localized.locale === 'en')
                ?.streetNumber ?? null,
            streetName:
              localizedRows.find(localized => localized.locale === 'en')?.streetName ??
              null,
          }),
          versionHash: row.versionHash,
        } satisfies AddressVersionSnapshot,
      ] as const
    }),
  )

  return new Map(snapshots)
}

export async function prepareAddressVersionInsertContext(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
): Promise<AddressVersionInsertContext> {
  const dataset = await getDatasetRecordByReleaseId(
    metaDb,
    message.releaseId ?? message.datasetId,
  )

  if (!dataset) {
    throw new Error(`Release not found: ${message.releaseId ?? message.datasetId}`)
  }

  const snapshot = await ensureDraftSnapshotForRelease(
    metaDb,
    'address',
    dataset.releaseCode,
  )

  const year = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForKindRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForKindRegionYear(
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

  const releaseRole = dataset.source === 'hkgov' ? 'primary' : 'enrichment'

  await upsertSnapshotSource(
    metaDb,
    snapshot.id,
    dataset.datasetId,
    dataset.releaseId,
    releaseRole,
  )
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)

  return {
    regionCode: message.regionCode,
    releaseId: dataset.releaseId,
    releaseRole,
    snapshotId: snapshot.id,
    snapshotMonth: message.snapshotMonth,
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
  snapshotMonth: string,
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
          validToMonth: snapshotMonth,
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
  snapshotMonth: string,
  currentRows: Map<string, AddressVersionSnapshot>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  const now = new Date().toISOString()

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToMonth: snapshotMonth,
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

  return missingIds.length
}

export async function deleteStaleAddressCurrentRows(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  seenIds: Set<string>,
) {
  const stagedRows = (await db
    .select({
      id: currentSchema.address2d.id,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshotId))
    .all()) as Array<{ id: string }>

  const staleIds = stagedRows.map(row => row.id).filter(id => !seenIds.has(id))

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
            validFromMonth: context.snapshotMonth,
            validToMonth: null,
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
            validFromMonth: context.snapshotMonth,
            validToSnapshotId: null,
            validToMonth: null,
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
