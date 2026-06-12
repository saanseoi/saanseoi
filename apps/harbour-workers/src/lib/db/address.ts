import { and, eq, inArray } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  getDatasetRecordByReleaseId,
  resolveReleaseSetForType,
  resolveShardForKindRegionYear,
  upsertReleaseSetMember,
  upsertReleaseSetShardAssignment,
  upsertReleaseShardAssignment,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
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

export type AddressBaseRecord = AddressRow
export type AddressI18nRecord = NewAddressI18nRow

export type AddressVersionSnapshot = {
  churnHash: string
  id: string
  localizedRows: AddressI18nPayload[]
  matchKey: string | null
  versionHash: string
}

export async function getCurrentAddressVersionMap(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  options: {
    buildAddressBaseHashInput: (
      base: Omit<AddressRow, 'createdAt' | 'updatedAt'> | AddressRow,
    ) => Omit<AddressRow, 'createdAt' | 'updatedAt'>
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
      otBbox: historySchema.address2dVersions.otBbox,
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

  for (const addressIdChunk of chunkArray(addressIds, getMaxItemsPerInClause())) {
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

export async function closeCurrentAddressVersion(
  db: HarbourWritableDb,
  addressId: string,
  releaseSetId: string,
  snapshotMonth: string,
) {
  await runWithWriteRetry(() =>
    db
      .update(historySchema.address2dVersions)
      .set({
        isCurrent: false,
        validToReleaseSetId: releaseSetId,
        validToMonth: snapshotMonth,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(historySchema.address2dVersions.id, addressId),
          eq(historySchema.address2dVersions.isCurrent, true),
        ),
      )
      .run(),
  )
}

export async function deleteMissingCurrentAddresses(
  currentDb: HarbourReadableDb & HarbourWritableDb,
  historyDb: HarbourReadableDb & HarbourWritableDb,
  releaseSetId: string,
  snapshotMonth: string,
  currentRows: Map<string, AddressVersionSnapshot>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause())) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dVersions)
        .set({
          isCurrent: false,
          validToReleaseSetId: releaseSetId,
          validToMonth: snapshotMonth,
          updatedAt: new Date().toISOString(),
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
      currentDb
        .delete(currentSchema.address2dI18n)
        .where(inArray(currentSchema.address2dI18n.addressId, chunk))
        .run(),
    )
    await runWithWriteRetry(() =>
      currentDb
        .delete(currentSchema.address2d)
        .where(inArray(currentSchema.address2d.id, chunk))
        .run(),
    )
  }

  return missingIds.length
}

export async function upsertAddressCurrentState(
  db: HarbourWritableDb,
  base: AddressBaseRecord,
  i18nRows: AddressI18nPayload[],
) {
  const now = base.updatedAt

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2d)
      .values(base)
      .onConflictDoUpdate({
        target: currentSchema.address2d.id,
        set: {
          streetId: base.streetId,
          hamletId: base.hamletId,
          microhoodId: base.microhoodId,
          villageId: base.villageId,
          neighbourhoodId: base.neighbourhoodId,
          macrohoodId: base.macrohoodId,
          townId: base.townId,
          districtId: base.districtId,
          areaId: base.areaId,
          countryId: base.countryId,
          geometry: base.geometry,
          identifiers: base.identifiers,
          otBbox: base.otBbox,
          sources: base.sources,
          updatedAt: now,
        },
      })
      .run(),
  )

  await replaceAddressCurrentI18n(db, base.id, i18nRows, now)
}

export async function replaceAddressCurrentI18n(
  db: HarbourWritableDb,
  addressId: string,
  i18nRows: AddressI18nPayload[],
  now: string,
) {
  await runWithWriteRetry(() =>
    db
      .delete(currentSchema.address2dI18n)
      .where(eq(currentSchema.address2dI18n.addressId, addressId))
      .run(),
  )

  if (i18nRows.length === 0) {
    return
  }

  await insertAddressI18nInChunks(
    db,
    i18nRows.map(row => ({
      ...row,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

export async function insertAddressVersionRows(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  historyDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  base: AddressBaseRecord,
  i18nRows: AddressI18nPayload[],
  versionHash: string,
  now: string,
  environment: 'preview' | 'production',
) {
  const dataset = await getDatasetRecordByReleaseId(
    metaDb,
    message.releaseId ?? message.datasetId,
  )

  if (!dataset) {
    throw new Error(`Release not found: ${message.releaseId ?? message.datasetId}`)
  }
  const releaseSet = await resolveReleaseSetForType(metaDb, message.type)
  if (!releaseSet) {
    throw new Error(`Release set not found for type: ${message.type}`)
  }
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
  await upsertReleaseSetMember(
    metaDb,
    releaseSet.id,
    dataset.datasetId,
    dataset.releaseId,
    dataset.source === 'hkgov' ? 'primary' : 'enrichment',
  )
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)
  await upsertReleaseSetShardAssignment(metaDb, releaseSet.id, currentShard.id)
  await upsertReleaseSetShardAssignment(metaDb, releaseSet.id, historyShard.id)

  await runWithWriteRetry(() =>
    historyDb
      .insert(historySchema.address2dVersions)
      .values({
        ...base,
        createdAt: now,
        isCurrent: true,
        regionCode: message.regionCode,
        releaseId: dataset.releaseId,
        validFromReleaseSetId: releaseSet.id,
        validFromMonth: message.snapshotMonth,
        validToReleaseSetId: null,
        validToMonth: null,
        versionHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          historySchema.address2dVersions.id,
          historySchema.address2dVersions.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId: dataset.releaseId,
          validFromReleaseSetId: releaseSet.id,
          validFromMonth: message.snapshotMonth,
          validToReleaseSetId: null,
          validToMonth: null,
          updatedAt: now,
        },
      })
      .run(),
  )

  if (i18nRows.length === 0) {
    return
  }

  await insertAddressVersionsI18nInChunks(
    historyDb,
    i18nRows.map(row => ({
      ...row,
      releaseId: dataset.releaseId,
      validFromReleaseSetId: releaseSet.id,
      validToReleaseSetId: null,
      isCurrent: true,
      versionHash,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

async function insertAddressI18nInChunks(
  db: HarbourWritableDb,
  rows: NewAddressI18nRow[],
) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(14))) {
    await runWithWriteRetry(() =>
      db.insert(currentSchema.address2dI18n).values(chunk).run(),
    )
  }
}

async function insertAddressVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<
    AddressI18nPayload & {
      releaseId: string
      validFromReleaseSetId: string
      validToReleaseSetId: string | null
      isCurrent: boolean
      versionHash: string
      createdAt: string
      updatedAt: string
    }
  >,
) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(19))) {
    await runWithWriteRetry(() =>
      db
        .insert(historySchema.address2dVersionsI18n)
        .values(chunk)
        .onConflictDoNothing()
        .run(),
    )
  }
}
