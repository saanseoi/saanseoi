import { and, desc, eq } from 'drizzle-orm'
import type { RegionCode } from '@repo/core'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { createHash } from '@repo/core/pipeline/utils'
import { currentSchema, metaSchema, streetLocaleCodes } from '@repo/db'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  resolveLandsdStreetDistricts,
  type LandsdStreetCanonicalDistrict,
} from '../../sources/hkgov/landsd/street/landsdStreetDistricts.ts'
import type {
  LandsdStreetChangelogEntry,
  LandsdStreetLifecycleInput,
  LandsdStreetMaterialisedStreet,
} from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import { mintLandsdStreetId } from '../../sources/hkgov/landsd/street/landsdStreetIds.ts'
import type {
  LandsdStreetUploadPlan,
  PreparedMaterialisedStreet,
  PreparedStreet,
  PreparedStreetChangelog,
} from './processLocalStreetSqlUploadTypes.ts'
import {
  optionalString,
  parseAssetLinks,
  parseBoolean,
  parseI18n,
  parseNoticeApplication,
  parseNullableRecord,
  parseSourceKind,
  parseStringArray,
  requireString,
  splitNameAlternatives,
  stableAssetLinks,
  stableI18n,
  stableLifecycleI18n,
} from './processLocalStreetSqlUploadParsing.ts'
import { REQUIRED_LOCALES } from './processLocalStreetSqlUploadConfig.ts'

export async function readPreparedStreets(
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
    sources: {
      hkgovLandsd: {
        sourceKind,
        sourceRecordId,
      },
    },
    yearBuilt: null,
  }
  const sourceHash = await createHash({
    application,
    districtCodes,
    i18n: i18n.map(stableI18n),
    deferToNotices,
    gazetteDate,
    noticeRef,
    effectiveDate,
    parserDiagnostics,
    previousNoticeRefs,
    rawExtractedText,
    sourceKind,
    noticeType,
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

export function toLifecycleInput(record: PreparedStreet): LandsdStreetLifecycleInput {
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

export function resolvePersistentStreetIds(
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
 * Canonical source references are the durable identity bridge. Source tables retain
 * publisher evidence only, so a replay never needs to persist a canonical ID
 * beside it.
 */
export function indexCanonicalStreetIdsBySourceRecord(
  streets: LandsdStreetMaterialisedStreet[],
) {
  const result = new Map<string, string[]>()
  for (const street of streets) {
    const landsd = street.sources.hkgovLandsd
    if (!landsd || typeof landsd !== 'object' || Array.isArray(landsd)) continue
    const sourceReferences = landsd as Record<string, unknown>
    for (const key of ['baselineRecordKeys', 'noticeRecordKeys'] as const) {
      const recordKeys = sourceReferences[key]
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

export async function addMaterialisedStreetHash(
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
      sources: street.sources,
      status: street.status,
      version: street.version,
    }),
  }
}

export async function addStreetChangelogHash(
  entry: LandsdStreetChangelogEntry,
  source: { sourceReleaseId: string; sourceShardId: string },
): Promise<PreparedStreetChangelog> {
  return {
    ...entry,
    ...source,
    versionHash: await createHash({ ...entry, ...source }),
  }
}

export function validatePreparedStreets(
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
export function validateBaselineCoverage(
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

export async function loadCanonicalDistricts(
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
        eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
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
      [
        'A published canonical Overture division snapshot is required to normalize LandsD street districts.',
        'Run ./bin/saanseoi init:divisions:geographic --target local, then retry the update.',
      ].join(' '),
    )
  }
  const rows = await currentDb
    .select({
      id: currentSchema.divisions.id,
      level: currentSchema.divisions.level,
      locale: currentSchema.divisionsI18n.locale,
      name: currentSchema.divisionsI18n.name,
      nameAlts: currentSchema.divisionsI18n.nameAlts,
      category: currentSchema.divisions.category,
      class: currentSchema.divisions.class,
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
    if (row.class !== 'district') continue
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
      'The published canonical Overture division snapshot contains no district rows.',
    )
  }
  return districts
}
