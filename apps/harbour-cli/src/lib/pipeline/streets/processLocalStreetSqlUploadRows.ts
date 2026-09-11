import { and, eq, inArray, sql } from 'drizzle-orm'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import { chunkArray } from '@repo/core/pipeline/utils'
import { currentRowChangedSql } from '@repo/core/pipeline/services/publication/currentWrites.ts'
import { currentSchema, historySchema, sourceSchema, streetLocaleCodes } from '@repo/db'
import type {
  LandsdStreetLifecycleI18n,
  LandsdStreetMaterialisedStreet,
} from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type {
  PreparedMaterialisedStreet,
  PreparedStreet,
  PreparedStreetChangelog,
} from './processLocalStreetSqlUploadTypes.ts'
import {
  isNoticeSource,
  normaliseStreetName,
  parseNullableRecord,
  requireString,
} from './processLocalStreetSqlUploadParsing.ts'

export async function listCurrentSourceRows(db: HarbourReadableDb, ids: string[]) {
  const rows: Array<{ sourceRecordId: string; versionHash: string }> = []
  for (const idsChunk of chunkArray([...new Set(ids)], 90)) {
    if (idsChunk.length === 0) continue
    rows.push(
      ...(await db
        .select({
          sourceRecordId:
            sourceSchema.sourceHkgovLandsdStreetBaselineRecords.sourceRecordId,
          versionHash: sourceSchema.sourceHkgovLandsdStreetBaselineRecords.versionHash,
        })
        .from(sourceSchema.sourceHkgovLandsdStreetBaselineRecords)
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetBaselineRecords.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetBaselineRecords.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .all()),
      ...(await db
        .select({
          sourceRecordId: sourceSchema.sourceHkgovLandsdStreetNotices.sourceRecordId,
          versionHash: sourceSchema.sourceHkgovLandsdStreetNotices.versionHash,
        })
        .from(sourceSchema.sourceHkgovLandsdStreetNotices)
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetNotices.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetNotices.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .all()),
    )
  }
  return rows
}

export async function listCurrentMaterialisedStreets(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<LandsdStreetMaterialisedStreet[]> {
  const streetRows = await db
    .select({
      deletedAt: currentSchema.streets.deletedAt,
      districtIds: currentSchema.streets.districtIds,
      id: currentSchema.streets.id,
      gazetteDate: currentSchema.streets.gazetteDate,
      sources: currentSchema.streets.sources,
      status: currentSchema.streets.status,
      version: currentSchema.streets.version,
    })
    .from(currentSchema.streets)
    .where(
      and(
        eq(currentSchema.streets.snapshotId, snapshotId),
        eq(currentSchema.streets.status, 'active'),
      ),
    )
    .all()
  if (streetRows.length === 0) return []
  const i18nRows = await db
    .select({
      description: currentSchema.streetsI18n.description,
      locale: currentSchema.streetsI18n.locale,
      name: currentSchema.streetsI18n.name,
      streetId: currentSchema.streetsI18n.streetId,
    })
    .from(currentSchema.streetsI18n)
    .where(eq(currentSchema.streetsI18n.snapshotId, snapshotId))
    .all()
  const i18nByStreet = new Map<string, LandsdStreetLifecycleI18n[]>()
  for (const row of i18nRows) {
    if (row.locale !== 'en' && row.locale !== 'zh-Hant') continue
    const values = i18nByStreet.get(row.streetId) ?? []
    values.push({
      description: row.description,
      locale: row.locale,
      name: row.name,
    })
    i18nByStreet.set(row.streetId, values)
  }
  return streetRows.map(row => ({
    deletedAt: row.deletedAt,
    districtIds: Array.isArray(row.districtIds) ? row.districtIds : [],
    i18n: i18nByStreet.get(row.id) ?? [],
    id: row.id,
    gazetteDate: row.gazetteDate,
    sources:
      row.sources && typeof row.sources === 'object'
        ? (row.sources as Record<string, unknown>)
        : {},
    status: row.status === 'deleted' ? 'deleted' : 'active',
    version: row.version,
  }))
}

export async function closeSourceVersions(
  db: HarbourWritableDb,
  records: PreparedStreet[],
  sourceVersion: string,
  now: string,
) {
  const baselineIds = records
    .filter(record => record.sourceKind === 'baseline')
    .map(record => record.base.id)
  const noticeIds = records.filter(isNoticeSource).map(record => record.base.id)
  for (const idsChunk of chunkArray([...new Set(baselineIds)], 90)) {
    if (idsChunk.length === 0) continue
    await Promise.all([
      db
        .update(sourceSchema.sourceHkgovLandsdStreetBaselineRecords)
        .set({ isCurrent: false, updatedAt: now, validToRelease: sourceVersion })
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetBaselineRecords.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetBaselineRecords.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .run(),
    ])
  }
  for (const idsChunk of chunkArray([...new Set(noticeIds)], 90)) {
    if (idsChunk.length === 0) continue
    await Promise.all([
      db
        .update(sourceSchema.sourceHkgovLandsdStreetNotices)
        .set({ isCurrent: false, updatedAt: now, validToRelease: sourceVersion })
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetNotices.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetNotices.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .run(),
      db
        .update(sourceSchema.sourceHkgovLandsdStreetNoticeApplications)
        .set({ isCurrent: false, updatedAt: now, validToRelease: sourceVersion })
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetNoticeApplications.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetNoticeApplications.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .run(),
    ])
  }
}

export async function closeHistoryVersions(
  db: HarbourWritableDb,
  ids: string[],
  snapshotId: string,
  now: string,
) {
  const uniqueIds = [...new Set(ids)]
  for (const idsChunk of chunkArray(uniqueIds, 90)) {
    if (idsChunk.length === 0) continue
    await Promise.all([
      db
        .update(historySchema.streets)
        .set({ isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(historySchema.streets.isCurrent, true),
            inArray(historySchema.streets.id, idsChunk),
          ),
        )
        .run(),
      db
        .update(historySchema.streetsI18n)
        .set({ isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(historySchema.streetsI18n.isCurrent, true),
            inArray(historySchema.streetsI18n.streetId, idsChunk),
          ),
        )
        .run(),
    ])
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    recordType: 'street',
    operation: 'delete',
    changes: uniqueIds.map(recordId => ({ recordId })),
  })
}

export async function replaceCurrentStreetRows(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  for (const idsChunk of chunkArray(
    records.filter(record => record.status === 'deleted').map(record => record.id),
    90,
  )) {
    if (idsChunk.length === 0) continue
    await db
      .delete(currentSchema.streets)
      .where(
        and(
          eq(currentSchema.streets.snapshotId, snapshotId),
          inArray(currentSchema.streets.id, idsChunk),
        ),
      )
      .run()
  }
  // Current snapshots contain only active streets. Deleted states are retained
  // in history and the changelog, never hidden behind an API-side predicate.
  for (const recordsChunk of chunkArray(
    records.filter(record => record.status === 'active'),
    8,
  )) {
    await db
      .insert(currentSchema.streets)
      .values(
        recordsChunk.map(record => ({
          deletedAt: record.deletedAt,
          districtIds: record.districtIds,
          id: record.id,
          gazetteDate: record.gazetteDate,
          snapshotId,
          sources: record.sources,
          status: record.status,
          version: record.version,
          yearBuilt: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [currentSchema.streets.snapshotId, currentSchema.streets.id],
        set: {
          deletedAt: sql`excluded.deletedAt`,
          districtIds: sql`excluded.districtIds`,
          gazetteDate: sql`excluded.gazetteDate`,
          sources: sql`excluded.sources`,
          status: sql`excluded.status`,
          version: sql`excluded.version`,
          yearBuilt: sql`excluded.yearBuilt`,
          updatedAt: sql`excluded.updatedAt`,
        },
        setWhere: currentRowChangedSql('streets', [
          'deletedAt',
          'districtIds',
          'gazetteDate',
          'sources',
          'status',
          'version',
          'yearBuilt',
        ]),
      })
      .run()
  }
}

export async function replaceCurrentStreetI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  for (const locale of streetLocaleCodes) {
    for (const idsChunk of chunkArray(
      records
        .filter(
          record =>
            record.status === 'deleted' ||
            !record.i18n.some(row => row.locale === locale),
        )
        .map(record => record.id),
      90,
    )) {
      if (idsChunk.length === 0) continue
      await db
        .delete(currentSchema.streetsI18n)
        .where(
          and(
            eq(currentSchema.streetsI18n.snapshotId, snapshotId),
            eq(currentSchema.streetsI18n.locale, locale),
            inArray(currentSchema.streetsI18n.streetId, idsChunk),
          ),
        )
        .run()
    }
  }
  const rows = records
    .filter(record => record.status === 'active')
    .flatMap(record =>
      record.i18n.map(item => ({
        base: null,
        createdAt: now,
        description: item.description,
        designator: null,
        directionalPrefix: null,
        directionalSuffix: null,
        locale: item.locale,
        name: item.name,
        normalised: normaliseStreetName(item.name),
        snapshotId,
        streetId: record.id,
        updatedAt: now,
      })),
    )
  for (const rowsChunk of chunkArray(rows, 6)) {
    await db
      .insert(currentSchema.streetsI18n)
      .values(rowsChunk)
      .onConflictDoUpdate({
        target: [
          currentSchema.streetsI18n.snapshotId,
          currentSchema.streetsI18n.streetId,
          currentSchema.streetsI18n.locale,
        ],
        set: {
          base: sql`excluded.base`,
          description: sql`excluded.description`,
          designator: sql`excluded.designator`,
          directionalPrefix: sql`excluded.directionalPrefix`,
          directionalSuffix: sql`excluded.directionalSuffix`,
          name: sql`excluded.name`,
          normalised: sql`excluded.normalised`,
          updatedAt: sql`excluded.updatedAt`,
        },
        setWhere: currentRowChangedSql('streetsI18n', [
          'base',
          'description',
          'designator',
          'directionalPrefix',
          'directionalSuffix',
          'name',
          'normalised',
        ]),
      })
      .run()
  }
}

export async function syncCurrentStreetChangelog(
  db: HarbourWritableDb,
  snapshotId: string,
  entries: PreparedStreetChangelog[],
  removedStreetIds: string[],
  now: string,
) {
  // D1 permits at most 100 bound variables. Each deletion also binds the
  // snapshot ID, so keep the existing conservative 90-ID batching.
  for (const idsChunk of chunkArray([...new Set(removedStreetIds)], 90)) {
    if (idsChunk.length === 0) continue
    await db
      .delete(currentSchema.streetChangelog)
      .where(
        and(
          eq(currentSchema.streetChangelog.snapshotId, snapshotId),
          inArray(currentSchema.streetChangelog.streetId, idsChunk),
        ),
      )
      .run()
  }
  const removed = new Set(removedStreetIds)
  const activeEntries = entries.filter(entry => !removed.has(entry.streetId))
  // 13 table columns; seven rows leave headroom below D1's 100-variable cap.
  for (const entriesChunk of chunkArray(activeEntries, 7)) {
    await db
      .insert(currentSchema.streetChangelog)
      .values(
        entriesChunk.map(entry => ({
          evidenceAssets: entry.evidenceAssets,
          createdAt: now,
          effectiveDate: entry.effectiveDate,
          isPartialNameChange: entry.isPartialNameChange,
          kind: entry.kind,
          gazetteDate: entry.gazetteDate,
          noticeRef: entry.noticeRef,
          snapshotId,
          recordKey: entry.recordKey,
          sourceReleaseId: entry.sourceReleaseId,
          sourceShardId: entry.sourceShardId,
          streetId: entry.streetId,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          currentSchema.streetChangelog.snapshotId,
          currentSchema.streetChangelog.recordKey,
          currentSchema.streetChangelog.streetId,
        ],
        set: {
          evidenceAssets: sql`excluded.evidenceAssets`,
          effectiveDate: sql`excluded.effectiveDate`,
          isPartialNameChange: sql`excluded.isPartialNameChange`,
          kind: sql`excluded.kind`,
          gazetteDate: sql`excluded.gazetteDate`,
          noticeRef: sql`excluded.noticeRef`,
          sourceReleaseId: sql`excluded.sourceReleaseId`,
          sourceShardId: sql`excluded.sourceShardId`,
          updatedAt: now,
        },
        setWhere: currentRowChangedSql('streetChangelog', [
          'evidenceAssets',
          'effectiveDate',
          'isPartialNameChange',
          'kind',
          'gazetteDate',
          'noticeRef',
          'sourceReleaseId',
          'sourceShardId',
        ]),
      })
      .run()
  }
}

export async function insertHistoryRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  for (const recordsChunk of chunkArray(records, 7)) {
    await db
      .insert(historySchema.streets)
      .values(
        recordsChunk.map(record => ({
          deletedAt: record.deletedAt,
          districtIds: record.districtIds,
          id: record.id,
          gazetteDate: record.gazetteDate,
          sources: record.sources,
          status: record.status,
          version: record.version,
          yearBuilt: null,
          createdAt: now,
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
          versionHash: record.versionHash,
        })),
      )
      .onConflictDoUpdate({
        target: [historySchema.streets.id, historySchema.streets.versionHash],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'street',
    operation: 'upsert',
    changes: records.map(record => ({
      recordId: record.id,
      versionHash: record.versionHash,
    })),
  })
}

export async function insertHistoryI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
      base: null,
      createdAt: now,
      description: item.description,
      designator: null,
      directionalPrefix: null,
      directionalSuffix: null,
      isCurrent: true,
      locale: item.locale,
      name: item.name,
      normalised: normaliseStreetName(item.name),
      snapshotId,
      sourceReleaseId: releaseId,
      streetId: record.id,
      updatedAt: now,
      versionHash: record.versionHash,
    })),
  )
  for (const rowsChunk of chunkArray(rows, 5)) {
    await db
      .insert(historySchema.streetsI18n)
      .values(rowsChunk)
      .onConflictDoUpdate({
        target: [
          historySchema.streetsI18n.streetId,
          historySchema.streetsI18n.versionHash,
          historySchema.streetsI18n.locale,
        ],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'streetI18n',
    operation: 'upsert',
    changes: rows.map(row => ({
      locale: row.locale,
      recordId: row.streetId,
      versionHash: row.versionHash,
    })),
  })
}

export async function insertHistoryStreetChangelog(
  db: HarbourWritableDb,
  snapshotId: string,
  entries: PreparedStreetChangelog[],
  now: string,
) {
  // 15 table columns; six rows remain within the D1 100-variable limit.
  for (const entriesChunk of chunkArray(entries, 6)) {
    await db
      .insert(historySchema.streetChangelog)
      .values(
        entriesChunk.map(entry => ({
          evidenceAssets: entry.evidenceAssets,
          createdAt: now,
          effectiveDate: entry.effectiveDate,
          isCurrent: true,
          isPartialNameChange: entry.isPartialNameChange,
          kind: entry.kind,
          gazetteDate: entry.gazetteDate,
          noticeRef: entry.noticeRef,
          snapshotId,
          recordKey: entry.recordKey,
          sourceReleaseId: entry.sourceReleaseId,
          sourceShardId: entry.sourceShardId,
          streetId: entry.streetId,
          updatedAt: now,
          versionHash: entry.versionHash,
        })),
      )
      .onConflictDoUpdate({
        target: [
          historySchema.streetChangelog.streetId,
          historySchema.streetChangelog.recordKey,
          historySchema.streetChangelog.versionHash,
        ],
        set: { isCurrent: true, snapshotId, updatedAt: now },
      })
      .run()
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: entries[0]?.sourceReleaseId ?? null,
    recordType: 'streetChangelog',
    operation: 'upsert',
    changes: [...new Set(entries.map(entry => entry.versionHash))].map(versionHash => ({
      recordId: versionHash,
      versionHash,
    })),
  })
}

export async function insertSourceRows(
  db: HarbourWritableDb,
  releaseId: string,
  sourceVersion: string,
  records: PreparedStreet[],
  now: string,
) {
  for (const rows of chunkArray(
    records.filter(record => record.sourceKind === 'baseline'),
    4,
  )) {
    await db
      .insert(sourceSchema.sourceHkgovLandsdStreetBaselineRecords)
      .values(
        rows.map(record => ({
          nameZhHant: requireString(
            record.i18n.find(item => item.locale === 'zh-Hant')?.name,
            `${record.base.id} Chinese Name`,
          ),
          createdAt: now,
          deferToNotices: record.deferToNotices,
          districtCode: requireString(
            record.districtCodes[0],
            `${record.base.id} District Code`,
          ),
          nameEn: requireString(
            record.i18n.find(item => item.locale === 'en')?.name,
            `${record.base.id} English Name`,
          ),
          isCurrent: true,
          releaseId,
          sourceRecordId: record.base.id,
          sources: [{ dataset: 'hkgov-landsd', sourceKind: 'streetBaseline' }],
          updatedAt: now,
          validFromRelease: sourceVersion,
          validToRelease: null,
          versionHash: record.sourceHash,
        })),
      )
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovLandsdStreetBaselineRecords.sourceRecordId,
          sourceSchema.sourceHkgovLandsdStreetBaselineRecords.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId,
          updatedAt: now,
          validFromRelease: sourceVersion,
          validToRelease: null,
        },
      })
      .run()
  }
  for (const rows of chunkArray(records.filter(isNoticeSource), 3)) {
    await db
      .insert(sourceSchema.sourceHkgovLandsdStreetNotices)
      .values(
        rows.map(record => ({
          createdAt: now,
          districtCodes: record.districtCodes,
          descriptionEn:
            record.i18n.find(item => item.locale === 'en')?.description ?? null,
          descriptionZhHant:
            record.i18n.find(item => item.locale === 'zh-Hant')?.description ?? null,
          effectiveDate: record.effectiveDate,
          evidenceAssets: record.evidenceAssets,
          gazetteDate: requireString(
            record.base.gazetteDate,
            `${record.base.id} gazetteDate`,
          ),
          isCurrent: true,
          kind: requireString(
            record.base.noticeType,
            `${record.base.id} noticeType`,
          ) as (typeof sourceSchema.landsdStreetNoticeTypes)[number],
          noticeRef: requireString(record.noticeRef, `${record.base.id} noticeRef`),
          nameEn: requireString(
            record.i18n.find(item => item.locale === 'en')?.name,
            `${record.base.id} English Name`,
          ),
          nameZhHant: requireString(
            record.i18n.find(item => item.locale === 'zh-Hant')?.name,
            `${record.base.id} Chinese Name`,
          ),
          parserDiagnostics: record.parserDiagnostics,
          previousNoticeRefs: record.previousNoticeRefs,
          rawExtractedText: record.rawExtractedText,
          releaseId,
          sourceRecordId: record.base.id,
          sources: [
            {
              dataset: 'hkgov-landsd',
              noticeRef: requireString(record.noticeRef, `${record.base.id} noticeRef`),
              sourceKind: 'governmentNotice',
            },
          ],
          updatedAt: now,
          validFromRelease: sourceVersion,
          validToRelease: null,
          versionHash: record.sourceHash,
        })),
      )
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovLandsdStreetNotices.sourceRecordId,
          sourceSchema.sourceHkgovLandsdStreetNotices.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId,
          updatedAt: now,
          validFromRelease: sourceVersion,
          validToRelease: null,
        },
      })
      .run()
    const applications = rows.filter(record => record.application)
    for (const applicationRows of chunkArray(applications, 6))
      await db
        .insert(sourceSchema.sourceHkgovLandsdStreetNoticeApplications)
        .values(
          applicationRows.map(record => ({
            createdAt: now,
            disposition: record.application?.disposition ?? 'apply',
            isCurrent: true,
            method: record.application?.method ?? 'automatic',
            nameChangeScope: record.application?.nameChangeScope ?? null,
            releaseId,
            retainedDescriptions: record.application?.retainedDescriptions ?? null,
            sourceRecordId: record.base.id,
            updatedAt: now,
            validFromRelease: sourceVersion,
            validToRelease: null,
            versionHash: record.sourceHash,
          })),
        )
        .onConflictDoUpdate({
          target: [
            sourceSchema.sourceHkgovLandsdStreetNoticeApplications.sourceRecordId,
            sourceSchema.sourceHkgovLandsdStreetNoticeApplications.versionHash,
          ],
          set: {
            isCurrent: true,
            releaseId,
            updatedAt: now,
            validFromRelease: sourceVersion,
            validToRelease: null,
          },
        })
        .run()
  }
}

export function parsePartialRetainedDescriptions(value: unknown, field: string) {
  const parsed = parseNullableRecord(value, field)
  if (!parsed) return null
  const locales = streetLocaleCodes
  const descriptions: Partial<Record<(typeof locales)[number], string>> = {}
  for (const locale of locales) {
    const description = parsed[locale]
    if (typeof description !== 'string' || !description.trim()) {
      throw new Error(`${field} must contain non-empty ${locale}.`)
    }
    descriptions[locale] = description.trim()
  }
  return descriptions as Record<(typeof locales)[number], string>
}
