import { and, eq, inArray } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type {
  AddressI18nPayload,
  AddressRow,
  CurrentAddressVersionRow,
  NewAddressI18nRow,
} from '@repo/db/schema'

import {
  address2d,
  address2dI18n,
  address2dVersions,
  address2dVersionsDatasets,
  address2dVersionsI18n,
  datasets,
} from '@repo/db/schema'

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
      otNumber: string | null
      otStreet: string | null
    }) => string | null
    normalizeAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
) {
  const versionRows = (await db
    .select({
      id: address2dVersions.id,
      streetId: address2dVersions.streetId,
      hamletId: address2dVersions.hamletId,
      microhoodId: address2dVersions.microhoodId,
      villageId: address2dVersions.villageId,
      neighbourhoodId: address2dVersions.neighbourhoodId,
      macrohoodId: address2dVersions.macrohoodId,
      townId: address2dVersions.townId,
      districtId: address2dVersions.districtId,
      areaId: address2dVersions.areaId,
      countryId: address2dVersions.countryId,
      geometry: address2dVersions.geometry,
      identifiersJson: address2dVersions.identifiersJson,
      otStreet: address2dVersions.otStreet,
      otNumber: address2dVersions.otNumber,
      otBboxJson: address2dVersions.otBboxJson,
      otVersion: address2dVersions.otVersion,
      sourcesJson: address2dVersions.sourcesJson,
      versionHash: address2dVersions.versionHash,
    })
    .from(address2dVersions)
    .innerJoin(
      address2dVersionsDatasets,
      and(
        eq(address2dVersions.id, address2dVersionsDatasets.addressId),
        eq(address2dVersions.versionHash, address2dVersionsDatasets.versionHash),
      ),
    )
    .innerJoin(datasets, eq(address2dVersionsDatasets.datasetId, datasets.datasetId))
    .where(
      and(
        eq(address2dVersions.isCurrent, true),
        eq(datasets.regionCode, regionCode),
        eq(datasets.type, 'address'),
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
        addressId: address2dI18n.addressId,
        locale: address2dI18n.locale,
        formattedAddress: address2dI18n.formattedAddress,
        buildingName: address2dI18n.buildingName,
        buildingNumberFrom: address2dI18n.buildingNumberFrom,
        buildingNumberTo: address2dI18n.buildingNumberTo,
        blockType: address2dI18n.blockType,
        blockNumber: address2dI18n.blockNumber,
        blockTypeBeforeNumber: address2dI18n.blockTypeBeforeNumber,
        phaseName: address2dI18n.phaseName,
        phaseNumber: address2dI18n.phaseNumber,
        estateName: address2dI18n.estateName,
        streetNumber: address2dI18n.streetNumber,
        streetName: address2dI18n.streetName,
      })
      .from(address2dI18n)
      .where(inArray(address2dI18n.addressId, addressIdChunk))
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
            otNumber: row.otNumber,
            otStreet: row.otStreet,
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
  snapshotMonth: string,
) {
  await runWithWriteRetry(() =>
    db
      .update(address2dVersions)
      .set({
        isCurrent: false,
        validToMonth: snapshotMonth,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(address2dVersions.id, addressId), eq(address2dVersions.isCurrent, true)))
      .run(),
  )
}

export async function deleteMissingCurrentAddresses(
  db: HarbourReadableDb & HarbourWritableDb,
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
      db
        .update(address2dVersions)
        .set({
          isCurrent: false,
          validToMonth: snapshotMonth,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(address2dVersions.isCurrent, true), inArray(address2dVersions.id, chunk)))
        .run(),
    )
    await runWithWriteRetry(() =>
      db.delete(address2dI18n).where(inArray(address2dI18n.addressId, chunk)).run(),
    )
    await runWithWriteRetry(() =>
      db.delete(address2d).where(inArray(address2d.id, chunk)).run(),
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
      .insert(address2d)
      .values(base)
      .onConflictDoUpdate({
        target: address2d.id,
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
          identifiersJson: base.identifiersJson,
          otStreet: base.otStreet,
          otNumber: base.otNumber,
          otBboxJson: base.otBboxJson,
          otVersion: base.otVersion,
          sourcesJson: base.sourcesJson,
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
    db.delete(address2dI18n).where(eq(address2dI18n.addressId, addressId)).run(),
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
  db: HarbourWritableDb,
  message: DatasetProcessingMessage,
  base: AddressBaseRecord,
  i18nRows: AddressI18nPayload[],
  versionHash: string,
  now: string,
) {
  await runWithWriteRetry(() =>
    db
      .insert(address2dVersions)
      .values({
        ...base,
        createdAt: now,
        isCurrent: true,
        validFromMonth: message.snapshotMonth,
        validToMonth: null,
        versionHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [address2dVersions.id, address2dVersions.versionHash],
        set: {
          isCurrent: true,
          validFromMonth: message.snapshotMonth,
          validToMonth: null,
          updatedAt: now,
        },
      })
      .run(),
  )

  await runWithWriteRetry(() =>
    db
      .insert(address2dVersionsDatasets)
      .values({
        addressId: base.id,
        versionHash,
        datasetId: message.datasetId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run(),
  )

  if (i18nRows.length === 0) {
    return
  }

  await insertAddressVersionsI18nInChunks(
    db,
    i18nRows.map(row => ({
      ...row,
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
    await runWithWriteRetry(() => db.insert(address2dI18n).values(chunk).run())
  }
}

async function insertAddressVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<AddressI18nPayload & { versionHash: string; createdAt: string; updatedAt: string }>,
) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(15))) {
    await runWithWriteRetry(() =>
      db.insert(address2dVersionsI18n).values(chunk).onConflictDoNothing().run(),
    )
  }
}
