import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import {
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  createLocaleStatsAccumulator,
  updateLocaleStatsAccumulator,
} from '@repo/core/pipeline/services/stats'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { chunkArray, createHash } from '@repo/core/pipeline/utils'
import {
  currentSchema,
  historySchema,
  metaSchema,
  sourceSchema,
  streetLocaleCodes,
  toIsoTimestamp,
  type LandsdStreetNameChangeScope,
  type LandsdStreetNoticeApplicationDisposition,
  type LandsdStreetNoticeApplicationMethod,
  type StreetEvidenceAsset,
  type StreetLocaleCode,
} from '@repo/db'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { LocalPipelineBucket } from '../addressSql/localBucket.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import {
  resolveLandsdStreetDistricts,
  type LandsdStreetCanonicalDistrict,
} from '../sources/landsd/street/landsdStreetDistricts.ts'
import {
  materialiseLandsdStreetLifecycle,
  type LandsdStreetChangelogEntry,
  type LandsdStreetLifecycleInput,
  type LandsdStreetLifecycleI18n,
  type LandsdStreetMaterialisedStreet,
  type LandsdStreetLifecycleTextCorrection,
} from '../sources/landsd/street/landsdStreetLifecycle.ts'
import { mintLandsdStreetId } from '../sources/landsd/street/landsdStreetIds.ts'
import type { LandsdStreetSourceKind } from '../sources/landsd/street/landsdStreet.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type LandsdStreetUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source: 'hkgov-landsd'
  sourceVersion: string
  theme: 'streets'
  type: 'street'
}

type AssetLink = {
  assetId: string
  assetUrl: string
  byteLength: number
  contentHash: string
  manifest: StreetEvidenceAsset['manifest']
  mediaType: string
  objectKey: string
  originalUrl: string
  publisherIdentifier?: string | null
  retrievedAt: string
  role: StreetEvidenceAsset['role']
  sourcePageLocale?: StreetLocaleCode
  sourcePageUrl?: string
}

type PreparedStreetI18n = {
  description: string | null
  locale: StreetLocaleCode
  name: string
}

type PreparedStreet = {
  base: {
    districtIds: string[]
    noticeType: string | null
    id: string
    gazetteDate: string | null
    sourceKeys: Record<string, unknown>
    yearBuilt: null
  }
  application: {
    sourceStreetId: string | null
    resultStreetId: string | null
    disposition: LandsdStreetNoticeApplicationDisposition
    method: LandsdStreetNoticeApplicationMethod
    nameChangeScope: LandsdStreetNameChangeScope | null
    retainedDescriptions: Partial<Record<'en' | 'zh-Hant' | 'zh-Hans', string>> | null
    correction: LandsdStreetLifecycleTextCorrection | null
  } | null
  districtCodes: string[]
  i18n: PreparedStreetI18n[]
  deferToNotices: boolean
  noticeRef: string | null
  effectiveDate: string | null
  parserDiagnostics: Record<string, unknown> | null
  previousNoticeRefs: string[]
  rawExtractedText: Record<string, unknown> | null
  evidenceAssets: AssetLink[]
  sourceHash: string
  sourceKind: LandsdStreetSourceKind
  streetId: string | null
}

type PreparedMaterialisedStreet = LandsdStreetMaterialisedStreet & {
  versionHash: string
}

type PreparedStreetChangelog = LandsdStreetChangelogEntry & {
  sourceReleaseId: string
  sourceShardId: string
  versionHash: string
}

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`
const LANDSD_STREET_SNAPSHOT_SOURCE_ROLE = 'primary'
const REQUIRED_LOCALES = streetLocaleCodes

/**
 * Imports a generated LandsD release after its evidence is registered as a
 * managed source asset. Street notices are an append-only ledger: a new publication
 * inherits its parent snapshot and replaces only matching immutable notice
 * IDs when a source revision genuinely changes their content.
 */
export async function processLocalStreetSqlUpload(
  target: UploadTarget,
  previewPlan: LandsdStreetUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { skipSnapshotCleanup?: boolean } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)

  const context = await resolveLocalAddressDbContext(
    target,
    previewPlan.regionCode,
    previewPlan.sourceVersion,
    { cacheTableProfile: 'street', includePreviousShardYears: true },
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = (
    target.remote
      ? createHarbourControlClient(target)
      : createLocalControlClient(metaDb, {
          publishClient: createHarbourControlClient(target) as HarbourClient,
        })
  ) as HarbourClient

  try {
    await syncStagedReleaseIntoLocalMetaCache(
      context.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'street', rowCount: previewPlan.rowCount },
      releaseCode,
    )

    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) throw new Error(`Release not found: ${releaseId}`)
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'street', {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      identityMode: 'persistent',
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: previewPlan.source,
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'snapshot-assembly-hkgov-landsd-street-v1',
        // This snapshot is deliberately pinned to this exact staged release,
        // rather than selecting the latest release through a rolling rule.
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'street',
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })

    const [historyShard, sourceShard] = await Promise.all([
      resolveShardForTypeRegionYear(
        metaDb,
        'history',
        target.remote ? 'production' : 'preview',
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
      resolveShardForTypeRegionYear(
        metaDb,
        'source',
        target.remote ? 'production' : 'preview',
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
    ])
    if (!historyShard || !sourceShard) {
      throw new Error(
        `Shard mapping not found for ${previewPlan.regionCode}/${previewPlan.sourceVersion}.`,
      )
    }
    await Promise.all([
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id),
      upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id),
    ])

    const canonicalDistricts = await loadCanonicalDistricts(
      metaDb,
      context.currentDb as unknown as HarbourReadableDb,
      previewPlan.regionCode,
    )
    const records = await readPreparedStreets(bucket, rawObjectKey, canonicalDistricts)
    validatePreparedStreets(records, previewPlan)
    const now = toIsoTimestamp()

    if (snapshot.parentSnapshotId) {
      await cloneStreetCurrentSnapshot(
        context.currentDb as unknown as HarbourReadableDb & HarbourWritableDb,
        snapshot.parentSnapshotId,
        snapshot.id,
        now,
      )
    }

    const recordIds = records.map(record => record.base.id)
    const [currentSourceRows, currentStreets] = await Promise.all([
      listCurrentSourceRows(
        context.sourceDb as unknown as HarbourReadableDb,
        recordIds,
      ),
      listCurrentMaterialisedStreets(
        context.currentDb as unknown as HarbourReadableDb,
        snapshot.id,
      ),
    ])
    const sourceHashById = new Map(
      currentSourceRows.map(row => [row.sourceRecordId, row.versionHash]),
    )
    const canonicalStreetIdsBySourceRecord =
      indexCanonicalStreetIdsBySourceRecord(currentStreets)
    const resolvedRecords = records.map(record =>
      resolvePersistentStreetIds(
        record,
        canonicalStreetIdsBySourceRecord.get(record.base.id) ?? [],
      ),
    )
    const changedSourceRecords = resolvedRecords.filter(
      record => sourceHashById.get(record.base.id) !== record.sourceHash,
    )
    const lifecycle = materialiseLandsdStreetLifecycle({
      current: currentStreets,
      events: changedSourceRecords.map(toLifecycleInput),
    })
    validateBaselineCoverage(resolvedRecords, lifecycle.current)
    const changedMaterialisedStreets = await Promise.all(
      lifecycle.changed.map(addMaterialisedStreetHash),
    )
    const preparedChangelog = await Promise.all(
      lifecycle.changelog.map(entry =>
        addStreetChangelogHash(entry, {
          sourceReleaseId: releaseId,
          sourceShardId: sourceShard.id,
        }),
      ),
    )

    await closeSourceVersions(
      context.sourceDb as unknown as HarbourWritableDb,
      changedSourceRecords,
      releaseCode,
      now,
    )
    await closeHistoryVersions(
      context.historyDb as unknown as HarbourWritableDb,
      changedMaterialisedStreets.map(record => record.id),
      snapshot.id,
      now,
    )
    await replaceCurrentStreetRows(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      changedMaterialisedStreets,
      now,
    )
    await replaceCurrentStreetI18nRows(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      changedMaterialisedStreets,
      now,
    )
    await syncCurrentStreetChangelog(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      preparedChangelog,
      changedMaterialisedStreets
        .filter(record => record.status === 'deleted')
        .map(record => record.id),
      now,
    )
    await insertHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      snapshot.id,
      releaseId,
      changedMaterialisedStreets,
      now,
    )
    await insertHistoryI18nRows(
      context.historyDb as unknown as HarbourWritableDb,
      snapshot.id,
      releaseId,
      changedMaterialisedStreets,
      now,
    )
    await insertHistoryStreetChangelog(
      context.historyDb as unknown as HarbourWritableDb,
      snapshot.id,
      preparedChangelog,
      now,
    )
    await insertSourceRows(
      context.sourceDb as unknown as HarbourWritableDb,
      releaseId,
      releaseCode,
      changedSourceRecords,
      now,
    )
    await replaceReleaseProcessingActions(metaDb, releaseId, [])
    await replaceDatasetStats(
      metaDb,
      releaseId,
      buildStreetStats(resolvedRecords, lifecycle.current, lifecycle.stats, now),
    )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        resourceType: 'street',
        sourceRows: previewPlan.rowCount,
        importedRows: records.length,
        changedRows: changedMaterialisedStreets.length,
        sourceRowsChanged: changedSourceRecords.length,
      },
      releaseCode,
    )
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    await client
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    context.cleanup()
  }
}

async function readPreparedStreets(
  bucket: LocalPipelineBucket,
  key: string,
  canonicalDistricts: LandsdStreetCanonicalDistrict[],
) {
  const file = await createAsyncBufferFromR2(bucket, key)
  const records: PreparedStreet[] = []
  for await (const batch of readParquetObjectsInBatches(file, 512)) {
    for (const raw of batch) {
      records.push(await normalisePreparedStreet(raw, canonicalDistricts))
    }
  }
  return records
}

async function normalisePreparedStreet(
  value: Record<string, unknown>,
  canonicalDistricts: LandsdStreetCanonicalDistrict[],
): Promise<PreparedStreet> {
  const sourceRecordId = requireString(value.id, 'id')
  const districtCodes = parseStringArray(value.district_codes, 'district_codes')
  const resolvedDistricts = resolveLandsdStreetDistricts(
    { en: null, zhHant: null },
    canonicalDistricts,
    districtCodes,
  )
  if (resolvedDistricts.unmatched.length > 0) {
    throw new Error(
      `LandsD street ${sourceRecordId} has unmatched district labels: ${resolvedDistricts.unmatched.join(', ')}.`,
    )
  }
  const i18n = parseI18n(value.i18n, sourceRecordId)
  const evidenceAssets = parseAssetLinks(value.evidence_assets, 'evidence_assets')
  const sourceKind = parseSourceKind(value.source_kind)
  const deferToNotices = parseBoolean(value.defer_to_notices, 'defer_to_notices')
  const streetId = optionalString(value.street_id)
  const application = parseNoticeApplication(value.application)
  const noticeRef = optionalString(value.notice_ref)
  const effectiveDate = optionalString(value.effective_date)
  const previousNoticeRefs = parseStringArray(
    value.previous_notice_refs ?? '[]',
    'previous_notice_refs',
  )
  const rawExtractedText = parseNullableRecord(
    value.raw_extracted_text,
    'raw_extracted_text',
  )
  const parserDiagnostics = parseNullableRecord(
    value.parser_diagnostics,
    'parser_diagnostics',
  )
  const gazetteDate = optionalString(value.gazette_date)
  const noticeType = optionalString(value.notice_type)

  const base = {
    districtIds: resolvedDistricts.districtIds,
    noticeType,
    id: sourceRecordId,
    gazetteDate,
    sourceKeys: {
      hkgovLandsd: {
        sourceKind,
        sourceRecordId,
      },
    },
    yearBuilt: null,
  }
  const sourceHash = await createHash({
    districtCodes,
    i18n: i18n.map(stableI18n),
    deferToNotices,
    noticeRef,
    effectiveDate,
    parserDiagnostics,
    previousNoticeRefs,
    rawExtractedText,
    sourceKind,
    evidenceAssets: stableAssetLinks(evidenceAssets),
  })
  return {
    base,
    application,
    districtCodes,
    i18n,
    deferToNotices,
    noticeRef,
    effectiveDate,
    parserDiagnostics,
    previousNoticeRefs,
    rawExtractedText,
    evidenceAssets,
    sourceHash,
    sourceKind,
    streetId,
  }
}

function toLifecycleInput(record: PreparedStreet): LandsdStreetLifecycleInput {
  return {
    sourceStreetId: record.application?.sourceStreetId ?? null,
    resultStreetId: record.application?.resultStreetId ?? null,
    districtIds: record.base.districtIds,
    disposition: record.application?.disposition ?? 'apply',
    deferToNotices: record.deferToNotices,
    gazetteDate: record.base.gazetteDate,
    noticeType: record.base.noticeType,
    i18n: record.i18n.map(item => ({
      description: item.description,
      locale: item.locale,
      name: item.name,
    })),
    method: record.application?.method ?? null,
    nameChangeScope: record.application?.nameChangeScope ?? null,
    noticeRef: record.noticeRef,
    effectiveDate: record.effectiveDate,
    previousNoticeRefs: record.previousNoticeRefs,
    retainedDescriptions: record.application?.retainedDescriptions ?? null,
    correction: record.application?.correction ?? null,
    evidenceAssets: record.evidenceAssets,
    sourceKind: record.sourceKind,
    recordKey: record.base.id,
    streetId: record.streetId,
  }
}

function resolvePersistentStreetIds(
  record: PreparedStreet,
  canonicalStreetIds: string[],
): PreparedStreet {
  if (record.sourceKind === 'baseline') {
    const streetId = uniqueCanonicalStreetId(canonicalStreetIds, record.base.id)
    return {
      ...record,
      streetId: streetId ?? record.streetId ?? mintLandsdStreetId(),
    }
  }
  if (record.base.noticeType === 'declaration' && record.application) {
    const resultStreetId = uniqueCanonicalStreetId(canonicalStreetIds, record.base.id)
    return {
      ...record,
      application: {
        ...record.application,
        resultStreetId:
          resultStreetId ?? record.application.resultStreetId ?? mintLandsdStreetId(),
      },
    }
  }
  return record
}

/**
 * Canonical source keys are the durable identity bridge. Source tables retain
 * publisher evidence only, so a replay never needs to persist a canonical ID
 * beside it.
 */
function indexCanonicalStreetIdsBySourceRecord(
  streets: LandsdStreetMaterialisedStreet[],
) {
  const result = new Map<string, string[]>()
  for (const street of streets) {
    const landsd = street.sourceKeys.hkgovLandsd
    if (!landsd || typeof landsd !== 'object' || Array.isArray(landsd)) continue
    const sourceKeys = landsd as Record<string, unknown>
    for (const key of ['baselineRecordKeys', 'noticeRecordKeys'] as const) {
      const recordKeys = sourceKeys[key]
      if (!Array.isArray(recordKeys)) continue
      for (const recordKey of recordKeys) {
        if (typeof recordKey !== 'string') continue
        result.set(recordKey, [...(result.get(recordKey) ?? []), street.id])
      }
    }
  }
  return result
}

function uniqueCanonicalStreetId(ids: string[], sourceRecordId: string) {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length <= 1) return uniqueIds[0] ?? null
  throw new Error(
    `Canonical source keys map LandsD record ${sourceRecordId} to multiple streets: ${uniqueIds.join(', ')}.`,
  )
}

async function addMaterialisedStreetHash(
  street: LandsdStreetMaterialisedStreet,
): Promise<PreparedMaterialisedStreet> {
  return {
    ...street,
    versionHash: await createHash({
      deletedAt: street.deletedAt,
      districtIds: [...street.districtIds].sort(),
      i18n: street.i18n.map(stableLifecycleI18n),
      id: street.id,
      gazetteDate: street.gazetteDate,
      sourceKeys: street.sourceKeys,
      status: street.status,
      version: street.version,
    }),
  }
}

async function addStreetChangelogHash(
  entry: LandsdStreetChangelogEntry,
  source: { sourceReleaseId: string; sourceShardId: string },
): Promise<PreparedStreetChangelog> {
  return {
    ...entry,
    ...source,
    versionHash: await createHash({ ...entry, ...source }),
  }
}

function validatePreparedStreets(
  records: PreparedStreet[],
  plan: LandsdStreetUploadPlan,
) {
  if (records.length !== plan.rowCount) {
    throw new Error(
      `LandsD street parquet expected ${plan.rowCount} records; found ${records.length}.`,
    )
  }
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.base.id)) {
      throw new Error(`Duplicate immutable LandsD street notice ID ${record.base.id}.`)
    }
    ids.add(record.base.id)
    if (
      record.base.gazetteDate &&
      `${record.base.gazetteDate}.0` > plan.sourceVersion
    ) {
      throw new Error(
        `LandsD street ${record.base.id} is newer than snapshot ${plan.sourceVersion}.`,
      )
    }
    for (const locale of REQUIRED_LOCALES) {
      if (!record.i18n.some(item => item.locale === locale)) {
        throw new Error(
          `LandsD street ${record.base.id} is missing ${locale} localization.`,
        )
      }
    }
  }
}

/**
 * The current baseline is a reconciliation contract. A row is covered either
 * by its persisted baseline street ID or, when marked deferToNotices, by
 * exactly one active notice-materialised street with the same bilingual name.
 */
function validateBaselineCoverage(
  records: PreparedStreet[],
  streets: LandsdStreetMaterialisedStreet[],
) {
  const errors: string[] = []
  for (const baseline of records.filter(record => record.sourceKind === 'baseline')) {
    const candidates = baseline.deferToNotices
      ? streets.filter(street => hasSameBilingualName(street, baseline))
      : streets.filter(street => street.id === baseline.streetId)
    if (candidates.length !== 1) {
      errors.push(
        `${baseline.base.id}: expected exactly one ${baseline.deferToNotices ? 'notice-history' : 'baseline-origin'} match; found ${candidates.length}${candidates.length ? ` (${candidates.map(street => street.id).join(', ')})` : ''}`,
      )
    }
  }
  if (errors.length) {
    throw new Error(`LandsD baseline coverage preflight failed:\n${errors.join('\n')}`)
  }
}

function hasSameBilingualName(
  street: LandsdStreetMaterialisedStreet,
  baseline: PreparedStreet,
) {
  return streetLocaleCodes.every(locale => {
    const source = baseline.i18n.find(value => value.locale === locale)
    const materialised = street.i18n.find(value => value.locale === locale)
    return source?.name === materialised?.name
  })
}

async function loadCanonicalDistricts(
  metaDb: HarbourReadableDb,
  currentDb: HarbourReadableDb,
  regionCode: RegionCode,
) {
  const snapshot = await metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.status, 'published'),
        eq(metaSchema.metaSnapshotLineages.regionCode, regionCode),
      ),
    )
    .orderBy(
      desc(metaSchema.metaSnapshots.publishedAt),
      desc(metaSchema.metaSnapshots.createdAt),
    )
    .limit(1)
    .get()
  if (!snapshot) {
    throw new Error(
      'A published canonical division snapshot is required to normalize LandsD street districts.',
    )
  }
  const rows = await currentDb
    .select({
      id: currentSchema.divisions.id,
      level: currentSchema.divisions.level,
      locale: currentSchema.divisionsI18n.locale,
      name: currentSchema.divisionsI18n.name,
      nameAlts: currentSchema.divisionsI18n.nameAlts,
      type: currentSchema.divisions.type,
    })
    .from(currentSchema.divisions)
    .innerJoin(
      currentSchema.divisionsI18n,
      and(
        eq(currentSchema.divisions.snapshotId, currentSchema.divisionsI18n.snapshotId),
        eq(currentSchema.divisions.id, currentSchema.divisionsI18n.divisionId),
      ),
    )
    .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
    .all()
  const byId = new Map<string, LandsdStreetCanonicalDistrict>()
  for (const row of rows) {
    if (row.level !== 2 && row.type !== 'district') continue
    const district = byId.get(row.id) ?? { id: row.id, names: {} }
    if (row.locale === 'en' && row.name) district.names.en = row.name
    if (row.locale === 'zh-Hant' && row.name) district.names.zhHant = row.name
    const alternatives = [
      ...(district.names.alternatives ?? []),
      ...splitNameAlternatives(row.nameAlts),
    ]
    if (alternatives.length > 0)
      district.names.alternatives = [...new Set(alternatives)]
    byId.set(row.id, district)
  }
  const districts = [...byId.values()]
  if (districts.length === 0) {
    throw new Error(
      'The published division snapshot contains no canonical district rows.',
    )
  }
  return districts
}

async function cloneStreetCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  fromSnapshotId: string,
  toSnapshotId: string,
  now: string,
) {
  if (fromSnapshotId === toSnapshotId) return
  await db
    .insert(currentSchema.streets)
    .select(
      db
        .select({
          createdAt: sql<string>`${now}`,
          deletedAt: currentSchema.streets.deletedAt,
          districtIds: currentSchema.streets.districtIds,
          id: currentSchema.streets.id,
          gazetteDate: currentSchema.streets.gazetteDate,
          snapshotId: sql<string>`${toSnapshotId}`,
          sourceKeys: currentSchema.streets.sourceKeys,
          status: currentSchema.streets.status,
          updatedAt: sql<string>`${now}`,
          version: currentSchema.streets.version,
          yearBuilt: currentSchema.streets.yearBuilt,
        })
        .from(currentSchema.streets)
        .where(eq(currentSchema.streets.snapshotId, fromSnapshotId)),
    )
    .onConflictDoNothing()
    .run()
  await db
    .insert(currentSchema.streetsI18n)
    .select(
      db
        .select({
          base: currentSchema.streetsI18n.base,
          createdAt: sql<string>`${now}`,
          description: currentSchema.streetsI18n.description,
          designator: currentSchema.streetsI18n.designator,
          directionalPrefix: currentSchema.streetsI18n.directionalPrefix,
          directionalSuffix: currentSchema.streetsI18n.directionalSuffix,
          locale: currentSchema.streetsI18n.locale,
          name: currentSchema.streetsI18n.name,
          normalised: currentSchema.streetsI18n.normalised,
          snapshotId: sql<string>`${toSnapshotId}`,
          streetId: currentSchema.streetsI18n.streetId,
          updatedAt: sql<string>`${now}`,
        })
        .from(currentSchema.streetsI18n)
        .where(eq(currentSchema.streetsI18n.snapshotId, fromSnapshotId)),
    )
    .onConflictDoNothing()
    .run()
  await db
    .insert(currentSchema.streetChangelog)
    .select(
      db
        .select({
          evidenceAssets: currentSchema.streetChangelog.evidenceAssets,
          createdAt: sql<string>`${now}`,
          effectiveDate: currentSchema.streetChangelog.effectiveDate,
          isPartialNameChange: currentSchema.streetChangelog.isPartialNameChange,
          kind: currentSchema.streetChangelog.kind,
          gazetteDate: currentSchema.streetChangelog.gazetteDate,
          noticeRef: currentSchema.streetChangelog.noticeRef,
          snapshotId: sql<string>`${toSnapshotId}`,
          recordKey: currentSchema.streetChangelog.recordKey,
          sourceReleaseId: currentSchema.streetChangelog.sourceReleaseId,
          sourceShardId: currentSchema.streetChangelog.sourceShardId,
          streetId: currentSchema.streetChangelog.streetId,
          updatedAt: sql<string>`${now}`,
        })
        .from(currentSchema.streetChangelog)
        .where(eq(currentSchema.streetChangelog.snapshotId, fromSnapshotId)),
    )
    .onConflictDoNothing()
    .run()
}

async function listCurrentSourceRows(db: HarbourReadableDb, ids: string[]) {
  const rows: Array<{
    sourceRecordId: string
    versionHash: string
    streetId: string | null
    resultStreetId: string | null
  }> = []
  for (const idsChunk of chunkArray([...new Set(ids)], 90)) {
    if (idsChunk.length === 0) continue
    rows.push(
      ...(await db
        .select({
          sourceRecordId:
            sourceSchema.sourceHkgovLandsdStreetBaselineRecords.sourceRecordId,
          versionHash: sourceSchema.sourceHkgovLandsdStreetBaselineRecords.versionHash,
          streetId: sourceSchema.sourceHkgovLandsdStreetBaselineRecords.streetId,
          resultStreetId: sql<string | null>`null`,
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
          streetId: sql<string | null>`null`,
          resultStreetId: sql<string | null>`null`,
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
    const applications = await db
      .select({
        resultStreetId:
          sourceSchema.sourceHkgovLandsdStreetNoticeApplications.resultStreetId,
        sourceRecordId:
          sourceSchema.sourceHkgovLandsdStreetNoticeApplications.sourceRecordId,
      })
      .from(sourceSchema.sourceHkgovLandsdStreetNoticeApplications)
      .where(
        and(
          eq(sourceSchema.sourceHkgovLandsdStreetNoticeApplications.isCurrent, true),
          inArray(
            sourceSchema.sourceHkgovLandsdStreetNoticeApplications.sourceRecordId,
            idsChunk,
          ),
        ),
      )
      .all()
    const applicationById = new Map(
      applications.map(row => [row.sourceRecordId, row.resultStreetId]),
    )
    for (const row of rows) {
      if (applicationById.has(row.sourceRecordId)) {
        row.resultStreetId = applicationById.get(row.sourceRecordId) ?? null
      }
    }
  }
  return rows
}

async function listCurrentMaterialisedStreets(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<LandsdStreetMaterialisedStreet[]> {
  const streetRows = await db
    .select({
      deletedAt: currentSchema.streets.deletedAt,
      districtIds: currentSchema.streets.districtIds,
      id: currentSchema.streets.id,
      gazetteDate: currentSchema.streets.gazetteDate,
      sourceKeys: currentSchema.streets.sourceKeys,
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
    sourceKeys:
      row.sourceKeys && typeof row.sourceKeys === 'object'
        ? (row.sourceKeys as Record<string, unknown>)
        : {},
    status: row.status === 'deleted' ? 'deleted' : 'active',
    version: row.version,
  }))
}

async function closeSourceVersions(
  db: HarbourWritableDb,
  records: PreparedStreet[],
  releaseCode: string,
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
        .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
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
        .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
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
        .update(sourceSchema.sourceHkgovLandsdStreetNoticeI18n)
        .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
        .where(
          and(
            eq(sourceSchema.sourceHkgovLandsdStreetNoticeI18n.isCurrent, true),
            inArray(
              sourceSchema.sourceHkgovLandsdStreetNoticeI18n.sourceRecordId,
              idsChunk,
            ),
          ),
        )
        .run(),
      db
        .update(sourceSchema.sourceHkgovLandsdStreetNoticeApplications)
        .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
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

async function closeHistoryVersions(
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

async function replaceCurrentStreetRows(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  for (const idsChunk of chunkArray(
    records.map(record => record.id),
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
          sourceKeys: record.sourceKeys,
          status: record.status,
          version: record.version,
          yearBuilt: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run()
  }
}

async function replaceCurrentStreetI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedMaterialisedStreet[],
  now: string,
) {
  for (const idsChunk of chunkArray(
    records.map(record => record.id),
    90,
  )) {
    if (idsChunk.length === 0) continue
    await db
      .delete(currentSchema.streetsI18n)
      .where(
        and(
          eq(currentSchema.streetsI18n.snapshotId, snapshotId),
          inArray(currentSchema.streetsI18n.streetId, idsChunk),
        ),
      )
      .run()
  }
  const rows = records.flatMap(record =>
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
    await db.insert(currentSchema.streetsI18n).values(rowsChunk).run()
  }
}

async function syncCurrentStreetChangelog(
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
      })
      .run()
  }
}

async function insertHistoryRows(
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
          sourceKeys: record.sourceKeys,
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

async function insertHistoryI18nRows(
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

async function insertHistoryStreetChangelog(
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
}

async function insertSourceRows(
  db: HarbourWritableDb,
  releaseId: string,
  releaseCode: string,
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
          chineseName: requireString(
            record.i18n.find(item => item.locale === 'zh-Hant')?.name,
            `${record.base.id} Chinese Name`,
          ),
          createdAt: now,
          deferToNotices: record.deferToNotices,
          districtCode: requireString(
            record.districtCodes[0],
            `${record.base.id} District Code`,
          ),
          englishName: requireString(
            record.i18n.find(item => item.locale === 'en')?.name,
            `${record.base.id} English Name`,
          ),
          isCurrent: true,
          releaseId,
          sourceRecordId: record.base.id,
          sources: [{ dataset: 'hkgov-landsd', sourceKind: 'streetBaseline' }],
          streetId: requireString(record.streetId, `${record.base.id} streetId`),
          updatedAt: now,
          validFromRelease: releaseCode,
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
          validFromRelease: releaseCode,
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
          validFromRelease: releaseCode,
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
          validFromRelease: releaseCode,
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
            resultStreetId: record.application?.resultStreetId ?? null,
            retainedDescriptions: record.application?.retainedDescriptions ?? null,
            sourceRecordId: record.base.id,
            sourceStreetId: record.application?.sourceStreetId ?? null,
            updatedAt: now,
            validFromRelease: releaseCode,
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
            validFromRelease: releaseCode,
            validToRelease: null,
          },
        })
        .run()
  }
}

function parsePartialRetainedDescriptions(value: unknown, field: string) {
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

async function insertSourceI18nRows(
  db: HarbourWritableDb,
  releaseId: string,
  releaseCode: string,
  records: PreparedStreet[],
  now: string,
) {
  const noticeRows = records.filter(isNoticeSource).flatMap(record =>
    record.i18n.map(item => ({
      createdAt: now,
      description: item.description,
      isCurrent: true,
      locale: item.locale,
      name: item.name,
      releaseId,
      sourceRecordId: record.base.id,
      updatedAt: now,
      validFromRelease: releaseCode,
      validToRelease: null,
      versionHash: record.sourceHash,
    })),
  )
  for (const rowsChunk of chunkArray(noticeRows, 5))
    await db
      .insert(sourceSchema.sourceHkgovLandsdStreetNoticeI18n)
      .values(rowsChunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovLandsdStreetNoticeI18n.sourceRecordId,
          sourceSchema.sourceHkgovLandsdStreetNoticeI18n.versionHash,
          sourceSchema.sourceHkgovLandsdStreetNoticeI18n.locale,
        ],
        set: {
          isCurrent: true,
          releaseId,
          updatedAt: now,
          validFromRelease: releaseCode,
          validToRelease: null,
        },
      })
      .run()
}

function buildStreetStats(
  records: PreparedStreet[],
  current: LandsdStreetMaterialisedStreet[],
  lifecycle: {
    added: number
    changed: number
    deleted: number
    noOpEvents: number
    restored: number
    versionsCreated: number
  },
  now: string,
) {
  const localeStats = createLocaleStatsAccumulator()
  const districtCounts = new Map<string, number>()
  const noticeTypeCounts = new Map<string, number>()
  const sourceAssetRoleCounts = new Map<string, number>()
  const descriptionCounts = new Map<string, number>()
  const descriptionTotals = new Map<string, number>()
  let pdfExtractionSuccess = 0
  let pdfExtractionFailure = 0
  for (const record of records) {
    if (isNoticeSource(record))
      increment(noticeTypeCounts, record.base.noticeType ?? 'unknown')
    for (const asset of record.evidenceAssets)
      increment(sourceAssetRoleCounts, asset.role)
    if (isNoticeSource(record)) {
      if (record.parserDiagnostics?.status === 'success') pdfExtractionSuccess += 1
      else pdfExtractionFailure += 1
    }
  }
  for (const street of current) {
    updateLocaleStatsAccumulator(
      localeStats,
      street.i18n.map(item => ({
        hasAltName: false,
        hasName: Boolean(item.name),
        isLocaleInferred: false,
        locale: item.locale,
      })),
    )
    for (const districtId of street.districtIds) increment(districtCounts, districtId)
    for (const item of street.i18n) {
      increment(descriptionTotals, item.locale)
      if (item.description) increment(descriptionCounts, item.locale)
    }
  }
  return [
    streetStat('source_events', 'processed_count', 'count', records.length, now),
    streetStat('canonical_streets', 'added_count', 'count', lifecycle.added, now),
    streetStat('canonical_streets', 'changed_count', 'count', lifecycle.changed, now),
    streetStat('canonical_streets', 'deleted_count', 'count', lifecycle.deleted, now),
    streetStat('canonical_streets', 'restored_count', 'count', lifecycle.restored, now),
    streetStat(
      'canonical_streets',
      'versions_created',
      'count',
      lifecycle.versionsCreated,
      now,
    ),
    streetStat('canonical_streets', 'no_op_events', 'count', lifecycle.noOpEvents, now),
    streetStat(
      'current_streets',
      'active_count',
      'count',
      current.filter(street => street.status === 'active').length,
      now,
    ),
    streetStat(
      'current_streets',
      'deleted_count',
      'count',
      current.filter(street => street.status === 'deleted').length,
      now,
    ),
    streetStat(
      'quality',
      'unmatched_district_count',
      'count',
      0,
      now,
      'qualityCheck',
      'district_normalization',
    ),
    streetStat(
      'quality',
      'pdf_extraction_success_count',
      'count',
      pdfExtractionSuccess,
      now,
    ),
    streetStat(
      'quality',
      'pdf_extraction_failure_count',
      'count',
      pdfExtractionFailure,
      now,
    ),
    streetStat('quality', 'unmatched_pdf_mapping_count', 'count', 0, now),
    streetStat('quality', 'ambiguous_lifecycle_target_count', 'count', 0, now),
    ...buildLocaleStatsRows(localeStats),
    ...statRowsForCounts(
      'description_completeness',
      'present_count',
      'count',
      descriptionCounts,
      now,
      'locale',
    ),
    ...statRowsForCounts(
      'description_completeness',
      'total_count',
      'count',
      descriptionTotals,
      now,
      'locale',
    ),
    ...buildDistrictDistributionStatsRows(districtCounts),
    ...statRowsForCounts(
      'notice_type',
      'count',
      'count',
      noticeTypeCounts,
      now,
      'noticeType',
    ),
    ...statRowsForCounts(
      'source_assets',
      'count',
      'count',
      sourceAssetRoleCounts,
      now,
      'role',
    ),
  ] satisfies ReleaseScopedStatsRow[]
}

function statRowsForCounts(
  dimension: string,
  metric: string,
  unit: string,
  counts: Map<string, number>,
  now: string,
  groupBy: string,
) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupValue, value]) =>
      streetStat(dimension, metric, unit, value, now, groupBy, groupValue),
    )
}

function streetStat(
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  now: string,
  groupBy: string | null = null,
  groupValue: string | null = null,
): ReleaseScopedStatsRow {
  return {
    createdAt: now,
    dimension,
    groupBy,
    groupValue,
    metric,
    metricUnit,
    type: 'release',
    updatedAt: now,
    value,
  }
}

function parseDistrict(value: unknown) {
  const record = parseRecord(value, 'district')
  return { en: optionalString(record.en), zhHant: optionalString(record.zhHant) }
}

function parseI18n(value: unknown, sourceRecordId: string): PreparedStreetI18n[] {
  const values = parseJsonArray(value, 'i18n')
  const result = values.map((item, index) => {
    const record = asRecord(item, `i18n[${index}]`)
    const locale = requireLocale(record.locale, `i18n[${index}].locale`)
    return {
      description: optionalString(record.description),
      locale,
      name: requireString(record.name, `i18n[${index}].name`),
    } satisfies PreparedStreetI18n
  })
  if (new Set(result.map(item => item.locale)).size !== result.length) {
    throw new Error(`LandsD street ${sourceRecordId} contains duplicate locales.`)
  }
  return result
}

function parseAssetLinks(value: unknown, name: string): AssetLink[] {
  return parseJsonArray(value, name).map((item, index) => {
    const record = asRecord(item, `${name}[${index}]`)
    const sourcePageLocale = optionalString(record.sourcePageLocale)
    const role = requireStreetAssetRole(record.role, `${name}[${index}].role`)
    const sourcePageUrl = optionalString(record.sourcePageUrl)
    return {
      assetId: requireString(record.assetId, `${name}[${index}].assetId`),
      assetUrl: requireString(record.assetUrl, `${name}[${index}].assetUrl`),
      byteLength: requireNumber(record.byteLength, `${name}[${index}].byteLength`),
      contentHash: requireString(record.contentHash, `${name}[${index}].contentHash`),
      manifest: parseAssetManifest(record.manifest, `${name}[${index}].manifest`),
      mediaType: requireString(record.mediaType, `${name}[${index}].mediaType`),
      objectKey: requireString(record.objectKey, `${name}[${index}].objectKey`),
      originalUrl: requireString(record.originalUrl, `${name}[${index}].originalUrl`),
      publisherIdentifier: optionalString(record.publisherIdentifier),
      retrievedAt: requireString(record.retrievedAt, `${name}[${index}].retrievedAt`),
      role,
      ...(sourcePageLocale === 'en' || sourcePageLocale === 'zh-Hant'
        ? { sourcePageLocale }
        : {}),
      ...(sourcePageUrl ? { sourcePageUrl } : {}),
    }
  })
}

function parseStringArray(value: unknown, name: string) {
  return parseJsonArray(value, name).map((item, index) =>
    requireString(item, `${name}[${index}]`),
  )
}

function parseNullableRecord(value: unknown, name: string) {
  if (value === null || value === undefined || value === '') return null
  return parseRecord(value, name)
}

function parseRecord(value: unknown, name: string) {
  return asRecord(parseJson(value, name), name)
}

function parseJsonArray(value: unknown, name: string) {
  const parsed = parseJson(value, name)
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array.`)
  return parsed
}

function parseJson(value: unknown, name: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${name} contains invalid JSON.`)
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function parseBoolean(value: unknown, name: string) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error(`${name} must be true or false.`)
}

function parseSourceKind(value: unknown): PreparedStreet['sourceKind'] {
  if (value === 'baseline' || value === 'notice' || value === 'historical-notice')
    return value
  throw new Error('source_kind must be baseline, notice, or historical-notice.')
}

function isNoticeSource(record: Pick<PreparedStreet, 'sourceKind'>): boolean {
  return record.sourceKind === 'notice' || record.sourceKind === 'historical-notice'
}

function parseNoticeApplication(value: unknown): PreparedStreet['application'] {
  if (value === undefined || value === null || value === '') return null
  const record = asRecord(parseJson(value, 'application'), 'application')
  const method = record.method
  const disposition = record.disposition
  const scope = record.nameChangeScope
  if (method !== 'automatic' && method !== 'manual')
    throw new Error('application.method must be automatic or manual.')
  if (disposition !== 'apply' && disposition !== 'noOp')
    throw new Error('application.disposition must be apply or noOp.')
  if (scope !== null && scope !== undefined && scope !== 'whole' && scope !== 'partial')
    throw new Error('application.nameChangeScope is invalid.')
  const retainedDescriptions =
    record.retainedDescriptions === null || record.retainedDescriptions === undefined
      ? null
      : parsePartialRetainedDescriptions(
          record.retainedDescriptions,
          'application.retainedDescriptions',
        )
  if (scope === 'partial' && !retainedDescriptions)
    throw new Error('partial application needs retainedDescriptions.')
  const correction = parseTextCorrection(record.correction)
  return {
    sourceStreetId: optionalString(record.sourceStreetId),
    resultStreetId: optionalString(record.resultStreetId),
    disposition,
    method,
    nameChangeScope: scope ?? null,
    retainedDescriptions,
    correction,
  }
}

function parseTextCorrection(
  value: unknown,
): LandsdStreetLifecycleTextCorrection | null {
  if (value === null || value === undefined) return null
  const record = asRecord(value, 'application.correction')
  const from = requireString(record.from, 'application.correction.from')
  const to = requireString(record.to, 'application.correction.to')
  if (!Array.isArray(record.fields) || record.fields.length === 0)
    throw new Error('application.correction.fields must be a non-empty array.')
  const fields = record.fields.map(field => {
    if (
      field === 'en.name' ||
      field === 'zh-Hant.name' ||
      field === 'en.description' ||
      field === 'zh-Hant.description' ||
      field === 'previousNoticeRefs'
    )
      return field
    throw new Error('application.correction.fields has an invalid field.')
  })
  return { fields, from, to }
}

function requireLocale(value: unknown, name: string): PreparedStreetI18n['locale'] {
  if (value === 'en' || value === 'zh-Hant') return value
  throw new Error(`${name} must be en or zh-Hant.`)
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireNumber(value: unknown, name: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be numeric.`)
  return parsed
}

function requireStreetAssetRole(
  value: unknown,
  name: string,
): StreetEvidenceAsset['role'] {
  const role = requireString(value, name)
  if (
    role !== 'gazettePlan' &&
    role !== 'gazettePlanPreview' &&
    role !== 'governmentNotice' &&
    role !== 'historicalGovernmentNotice' &&
    role !== 'sourceArchive' &&
    role !== 'sourcePage' &&
    role !== 'sourcePdf'
  ) {
    throw new Error(`${name} has unsupported LandsD asset role ${role}.`)
  }
  return role
}

function parseAssetManifest(
  value: unknown,
  name: string,
): StreetEvidenceAsset['manifest'] {
  const record = asRecord(value, name)
  return {
    assetId: requireString(record.assetId, `${name}.assetId`),
    assetUrl: requireString(record.assetUrl, `${name}.assetUrl`),
    contentHash: requireString(record.contentHash, `${name}.contentHash`),
    objectKey: requireString(record.objectKey, `${name}.objectKey`),
  }
}

function normaliseStreetName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, ' ').trim()
}

function stableI18n(value: PreparedStreetI18n) {
  return {
    description: value.description,
    locale: value.locale,
    name: value.name,
  }
}

function stableLifecycleI18n(value: LandsdStreetLifecycleI18n) {
  return {
    description: value.description,
    locale: value.locale,
    name: value.name,
  }
}

function stableAssetLinks(links: AssetLink[]) {
  return links.map(link => ({
    assetId: link.assetId,
    assetUrl: link.assetUrl,
    contentHash: link.contentHash,
    mediaType: link.mediaType,
    objectKey: link.objectKey,
    originalUrl: link.originalUrl,
    publisherIdentifier: link.publisherIdentifier ?? null,
    role: link.role,
    sourcePageLocale: link.sourcePageLocale ?? null,
    sourcePageUrl: link.sourcePageUrl ?? null,
  }))
}

function splitNameAlternatives(value: unknown) {
  return typeof value === 'string'
    ? value
        .split(/[|;]/)
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}
