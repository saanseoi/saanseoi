import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { and, desc, eq } from 'drizzle-orm'

import { currentSchema, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { resolveLocalAddressDbContext } from '../../../harbour-cli/src/lib/addressSql/localDbCache.ts'
import { processNativeSourceSqlRelease } from '../../../harbour-cli/src/lib/localPipeline/nativeSourceSql.ts'
import { readLandsdPlaceNameArchive } from '../../../harbour-cli/src/lib/sources/landsd/landsdPlaceName.ts'
import {
  normaliseRoadCentrelineFeatures,
  readLandsdRoadCentrelineArchive,
  requireResolvedRoadCentrelines,
  type RoadCentrelineDistrict,
  type RoadCentrelineStreet,
} from '../../../harbour-cli/src/lib/sources/landsd/roadCentreline.ts'

const PLACE_NAME_DATASET = 'ds-hk-hkgov-landsd-division'
const ROAD_CENTRELINE_DATASET = 'ds-hk-hkgov-landsd-road-centreline'

/**
 * Imports the complete native gazetteer ledger. Settlement is deliberately the
 * only class exposed by this dataset's divisions projection; other native
 * assertions remain available for future places work.
 */
export async function runHkgovLandsdPlaceNameIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const input = requireArchiveArguments(args, printUsage, PLACE_NAME_DATASET)
  const bytes = await readFile(input.archivePath)
  assertArchiveHash(bytes, input.sha256)
  const features = await readLandsdPlaceNameArchive(bytes)
  const rows = features.map(feature => ({
    district: optionalText(feature.properties.DISTRICT),
    geoNameId: String(feature.id),
    placeClass: requiredText(feature.properties.PLACE_CLASS, 'PLACE_CLASS'),
    placeType: requiredText(feature.properties.PLACE_TYPE, 'PLACE_TYPE'),
    rawProperties: feature.properties,
    sourceGeometry: feature.geometry,
    sourceRecordId: `LANDSD:PLACE_NAME:${feature.id}`,
    sources: [provenance(input, 'GEO_PLACE_NAME')],
  }))
  const i18nRows = features.flatMap(feature =>
    feature.placeNames.flatMap(name => [
      ...(name.englishName
        ? [
            {
              locale: 'en',
              name: name.englishName,
              sourceRecordId: `LANDSD:PLACE_NAME:${feature.id}`,
              status: name.status,
            },
          ]
        : []),
      ...(name.traditionalChineseName
        ? [
            {
              locale: 'zh-Hant',
              name: name.traditionalChineseName,
              sourceRecordId: `LANDSD:PLACE_NAME:${feature.id}`,
              status: name.status,
            },
          ]
        : []),
    ]),
  )
  await processNativeSourceSqlRelease(target, {
    archiveObjectKey: input.key,
    archivePath: input.archivePath,
    archiveSha256: input.sha256,
    cohortKey: input.sourceVersion,
    datasetCode: PLACE_NAME_DATASET,
    releaseNotesUrl: input.releaseNotesUrl,
    rowCount: rows.length,
    source: 'hkgov-landsd',
    sourceVersion: input.sourceVersion,
    tables: [
      {
        name: 'hkgovLandsdPlaceNames',
        provenance: 'required',
        replaceCurrentRows: true,
        rows,
      },
      {
        name: 'hkgovLandsdPlaceNameI18n',
        provenance: 'inherited',
        replaceCurrentRows: true,
        rows: i18nRows,
      },
    ],
    theme: 'divisions',
    type: 'division',
  })
}

/**
 * Imports every native centreline assertion and its available publisher
 * labels. Canonical matching is deliberately validated before publication:
 * unnamed rows have `streetId: null`; named unmatched rows block the release.
 */
export async function runHkgovLandsdRoadCentrelineIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
  canonical: {
    districts?: RoadCentrelineDistrict[]
    streets?: RoadCentrelineStreet[]
  } = {},
) {
  const input = requireArchiveArguments(args, printUsage, ROAD_CENTRELINE_DATASET)
  const bytes = await readFile(input.archivePath)
  assertArchiveHash(bytes, input.sha256)
  const archive = await readLandsdRoadCentrelineArchive(bytes)
  const resolvedCanonical =
    canonical.streets && canonical.districts
      ? canonical
      : await loadRoadCentrelineCanonical(target, input.sourceVersion)
  const result = normaliseRoadCentrelineFeatures({
    districts: resolvedCanonical.districts ?? [],
    features: archive.features,
    releaseId: input.sourceVersion,
    streets: resolvedCanonical.streets ?? [],
  })
  const summary = summariseRoadCentrelineMatching(archive.sourceFeatureCount, result)
  if (args.options['dry-run'] === true) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }
  // A source-only row is valid only when the publisher did not supply an
  // English label. Any named ambiguity is a curation gate, never a silent
  // partial street publication.
  requireResolvedRoadCentrelines(result)
  const rows = result.records.map(record => ({
    bbox: record.bbox,
    geometry: record.geometry,
    objectId: record.objectId,
    sourceGeometry: record.sourceGeometry,
    sourceRecordId: record.sourceRecordId,
    sources: [provenance(input, archive.layerName)],
    streetCode: record.streetCode,
    streetId: record.streetId,
    streetType: record.streetType,
  }))
  const i18nRows = result.records.flatMap(record =>
    record.i18n.map(i18n => ({ ...i18n, sourceRecordId: record.sourceRecordId })),
  )
  await processNativeSourceSqlRelease(target, {
    archiveObjectKey: input.key,
    archivePath: input.archivePath,
    archiveSha256: input.sha256,
    cohortKey: input.sourceVersion,
    datasetCode: ROAD_CENTRELINE_DATASET,
    releaseNotesUrl: input.releaseNotesUrl,
    rowCount: rows.length,
    source: 'hkgov-landsd',
    sourceVersion: input.sourceVersion,
    tables: [
      {
        name: 'hkgovLandsdRoadCentrelines',
        provenance: 'required',
        replaceCurrentRows: true,
        rows,
      },
      {
        name: 'hkgovLandsdRoadCentrelineI18n',
        provenance: 'inherited',
        replaceCurrentRows: true,
        rows: i18nRows,
      },
    ],
    theme: 'streets',
    type: 'street',
  })
}

function summariseRoadCentrelineMatching(
  sourceFeatureCount: number,
  result: ReturnType<typeof normaliseRoadCentrelineFeatures>,
) {
  const named = result.records.filter(record =>
    record.i18n.some(item => item.locale === 'en'),
  )
  return {
    ambiguousNamedSegments: result.issues.filter(issue => issue.kind === 'ambiguous')
      .length,
    matchedNamedSegments: named.filter(record => record.streetId !== null).length,
    namedSegments: named.length,
    sourceFeatureCount,
    sourceOnlyUnnamedSegments: result.records.filter(
      record =>
        record.streetId === null && !record.i18n.some(item => item.locale === 'en'),
    ).length,
    unmatchedNamedSegments: result.issues.filter(issue => issue.kind === 'unmatched')
      .length,
  }
}

/** Loads the exact published street and district snapshots used for matching. */
async function loadRoadCentrelineCanonical(
  target: UploadTarget,
  sourceVersion: string,
): Promise<{
  districts: RoadCentrelineDistrict[]
  streets: RoadCentrelineStreet[]
}> {
  const shardYear = /^\d{4}/.exec(sourceVersion)?.[0]
  if (!shardYear) {
    throw new Error(
      `Road Centreline source version ${sourceVersion} must begin with a four-digit year.`,
    )
  }
  const context = await resolveLocalAddressDbContext(target, 'hk', shardYear, {
    cacheTableProfile: 'street',
  })
  try {
    const metaDb = context.metaDb as unknown as HarbourReadableDb
    const [streetSnapshot, divisionSnapshot] = await Promise.all([
      latestPublishedSnapshot(metaDb, 'street'),
      latestPublishedSnapshot(metaDb, 'division'),
    ])
    if (!streetSnapshot || !divisionSnapshot) {
      throw new Error(
        'Road Centreline intake requires published canonical street and division snapshots.',
      )
    }
    const streetRows = await context.currentDb
      .select({
        districtIds: currentSchema.streets.districtIds,
        id: currentSchema.streets.id,
      })
      .from(currentSchema.streets)
      .where(
        and(
          eq(currentSchema.streets.snapshotId, streetSnapshot.id),
          eq(currentSchema.streets.status, 'active'),
        ),
      )
      .all()
    const streetI18n = await context.currentDb
      .select({
        locale: currentSchema.streetsI18n.locale,
        name: currentSchema.streetsI18n.name,
        streetId: currentSchema.streetsI18n.streetId,
      })
      .from(currentSchema.streetsI18n)
      .where(eq(currentSchema.streetsI18n.snapshotId, streetSnapshot.id))
      .all()
    const i18nByStreet = new Map<string, Map<string, string>>()
    for (const row of streetI18n) {
      if (row.locale !== 'en' && row.locale !== 'zh-Hant') continue
      i18nByStreet.set(
        row.streetId,
        new Map([...(i18nByStreet.get(row.streetId) ?? []), [row.locale, row.name]]),
      )
    }
    const streets = streetRows.flatMap(row => {
      const names = i18nByStreet.get(row.id)
      const englishName = names?.get('en')
      const traditionalChineseName = names?.get('zh-Hant')
      if (!englishName || !traditionalChineseName) return []
      return [
        {
          districtIds: Array.isArray(row.districtIds) ? row.districtIds : [],
          englishName,
          id: row.id,
          traditionalChineseName,
        },
      ]
    })
    const districtRows = await context.currentDb
      .select({
        geometry: currentSchema.divisionAreas.geometry,
        id: currentSchema.divisions.id,
      })
      .from(currentSchema.divisions)
      .innerJoin(
        currentSchema.divisionAreas,
        and(
          eq(
            currentSchema.divisions.snapshotId,
            currentSchema.divisionAreas.snapshotId,
          ),
          eq(currentSchema.divisions.id, currentSchema.divisionAreas.divisionId),
        ),
      )
      .where(
        and(
          eq(currentSchema.divisions.snapshotId, divisionSnapshot.id),
          eq(currentSchema.divisions.level, 2),
          eq(currentSchema.divisions.type, 'district'),
        ),
      )
      .all()
    const districts = districtRows.flatMap(row =>
      isGeoJsonGeometry(row.geometry) ? [{ geometry: row.geometry, id: row.id }] : [],
    )
    return { districts, streets }
  } finally {
    context.cleanup()
  }
}

async function latestPublishedSnapshot(
  metaDb: HarbourReadableDb,
  resourceType: 'division' | 'street',
) {
  return metaDb
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
        eq(metaSchema.metaSnapshots.resourceType, resourceType),
        eq(metaSchema.metaSnapshots.status, 'published'),
        eq(metaSchema.metaSnapshotLineages.regionCode, 'hk'),
      ),
    )
    .orderBy(
      desc(metaSchema.metaSnapshots.publishedAt),
      desc(metaSchema.metaSnapshots.createdAt),
    )
    .limit(1)
    .get()
}

function isGeoJsonGeometry(
  value: unknown,
): value is RoadCentrelineDistrict['geometry'] {
  return value !== null && typeof value === 'object' && 'type' in value
}

function requireArchiveArguments(
  args: ParsedArgs,
  printUsage: () => void,
  datasetCode: string,
) {
  const input = args.positionals[0]
  const sourceVersion = args.options['source-version']
  const releaseNotesUrl = args.options['release-notes-url']
  const key = args.options['source-archive-key']
  const sha256 = args.options['source-archive-sha256']
  if (
    !input ||
    args.positionals.length !== 1 ||
    typeof sourceVersion !== 'string' ||
    typeof releaseNotesUrl !== 'string' ||
    typeof key !== 'string' ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(sha256)
  ) {
    printUsage()
    throw new Error(
      `${datasetCode} ingestion requires <source.zip>, --source-version, --release-notes-url, --source-archive-key and --source-archive-sha256.`,
    )
  }
  return {
    archivePath: resolve(input),
    key,
    releaseNotesUrl,
    sha256,
    sourceVersion,
  }
}

function provenance(
  input: ReturnType<typeof requireArchiveArguments>,
  layerName: string,
) {
  return {
    dataset: 'hkgov-landsd',
    layerName,
    sourceArchiveKey: input.key,
    sourceArchiveSha256: input.sha256,
  }
}

function assertArchiveHash(bytes: Uint8Array, expected: string) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) {
    throw new Error(
      `Prepared CSDI archive SHA-256 differs from its updater manifest: expected ${expected}, found ${actual}.`,
    )
  }
}

function requiredText(value: unknown, field: string) {
  const text = optionalText(value)
  if (!text) throw new Error(`LandsD Place Name requires ${field}.`)
  return text
}

function optionalText(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
