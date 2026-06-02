import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { inspectParquet } from '../parquet-inspector'
import { openLocalD1 } from '../db/client'
import {
  getDatasetById,
  getLatestDatasetForTypeRegion,
  insertDataset,
  insertIngestRun,
} from '../db/repository'
import type {
  DatasetRecord,
  ParquetInspection,
  RegisterUploadOptions,
  RegisterUploadResult,
  RegionCode,
  SupportedTheme,
  SupportedType,
  UploadPlan,
} from '../../types'
import type { HarbourDb } from '../db/client'

const DEFAULT_RAW_ROOT = resolve(dirname(import.meta.dir), '../../../.local/harbour/raw')

const TYPE_ALIASES: Record<string, SupportedType> = {
  address: 'address',
  addresses: 'address',
  division: 'division',
  divisions: 'division',
  place: 'place',
  places: 'place',
}

const TYPE_THEME_MAP: Record<SupportedType, SupportedTheme> = {
  address: 'places',
  division: 'divisions',
  place: 'places',
}

const THEME_ALIASES: Record<string, SupportedTheme> = {
  division: 'divisions',
  divisions: 'divisions',
  place: 'places',
  places: 'places',
  address: 'places',
  addresses: 'places',
}

const REGION_ALIASES: Record<string, RegionCode> = {
  hk: 'hk',
  hkg: 'hk',
  'hong-kong': 'hk',
  hongkong: 'hk',
  'hong kong': 'hk',
  'hong kong sar': 'hk',
  mo: 'mo',
  macao: 'mo',
  macau: 'mo',
  'macao sar': 'mo',
  'macau sar': 'mo',
}

/**
 * Splits a file path into normalized non-empty path segments.
 */
function splitPathSegments(filePath: string) {
  return filePath
    .split(/[\\/]+/)
    .map(segment => segment.trim())
    .filter(Boolean)
}

/**
 * Lowercases and whitespace-normalizes a token before alias matching.
 */
function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Matches a path or file token to a supported dataset type alias.
 */
function matchTypeCandidate(candidate: string): SupportedType | null {
  const normalized = normalizeToken(candidate)

  for (const [token, type] of Object.entries(TYPE_ALIASES)) {
    const matcher = new RegExp(`(^|[ ._\\/-])${token}([ ._\\/-]|$)`, 'i')

    if (matcher.test(normalized)) {
      return type
    }
  }

  return null
}

/**
 * Matches a path or file token to a supported theme alias.
 */
function matchThemeCandidate(candidate: string): SupportedTheme | null {
  const normalized = normalizeToken(candidate)

  for (const [token, theme] of Object.entries(THEME_ALIASES)) {
    const matcher = new RegExp(`(^|[ ._\\/-])${token}([ ._\\/-]|$)`, 'i')

    if (matcher.test(normalized)) {
      return theme
    }
  }

  const matchedType = matchTypeCandidate(candidate)

  return matchedType ? TYPE_THEME_MAP[matchedType] : null
}

/**
 * Extracts a `YYYY-MM` snapshot month from a candidate token.
 */
function matchSnapshotMonthCandidate(candidate: string) {
  const match = candidate.match(/(20\d{2})-(0[1-9]|1[0-2])(?:-[0-3]\d(?:\.\d+)?)?/)

  if (match) {
    return `${match[1]}-${match[2]}`
  }

  const fallbackMatch = candidate.match(/(20\d{2})[-_]?((0[1-9])|(1[0-2]))/)

  if (!fallbackMatch) {
    return null
  }

  return `${fallbackMatch[1]}-${fallbackMatch[2]}`
}

/**
 * Infers the upstream source version from a dated path segment such as
 * `2025-04-16.0`.
 */
export function inferSourceVersionFromPath(filePath: string) {
  const pathSegments = splitPathSegments(filePath)

  for (const segment of pathSegments) {
    const match = segment.match(/^(20\d{2})-(0[1-9]|1[0-2])-[0-3]\d(?:\.\d+)?$/)

    if (match) {
      return segment
    }
  }

  return null
}

/**
 * Infers the dataset theme from the most specific matching path segment.
 */
export function inferThemeFromPath(filePath: string): SupportedTheme | null {
  const pathSegments = splitPathSegments(filePath)

  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index]

    if (!segment) {
      continue
    }

    const matchedTheme = matchThemeCandidate(segment)

    if (matchedTheme) {
      return matchedTheme
    }
  }

  return null
}

/**
 * Infers the dataset type from the most specific matching path segment.
 */
export function inferTypeFromPath(filePath: string): SupportedType | null {
  const pathSegments = splitPathSegments(filePath)

  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index]

    if (!segment) {
      continue
    }

    const matchedType = matchTypeCandidate(segment)

    if (matchedType) {
      return matchedType
    }
  }

  return null
}

/**
 * Infers the dataset theme from the file name alone.
 */
export function inferThemeFromFilename(filePath: string): SupportedTheme | null {
  return matchThemeCandidate(basename(filePath))
}

/**
 * Infers the dataset type from the file name alone.
 */
export function inferTypeFromFilename(filePath: string): SupportedType | null {
  return matchTypeCandidate(basename(filePath))
}

/**
 * Infers the snapshot month from any matching path segment.
 */
export function inferSnapshotMonthFromPath(filePath: string) {
  const pathSegments = splitPathSegments(filePath)

  for (const segment of pathSegments) {
    const month = matchSnapshotMonthCandidate(segment)

    if (month) {
      return month
    }
  }

  return null
}

/**
 * Infers the snapshot month from the file name alone.
 */
export function inferSnapshotMonthFromFilename(filePath: string) {
  const fileName = basename(filePath)
  const match = matchSnapshotMonthCandidate(fileName)

  if (!match) {
    return null
  }

  return match
}

/**
 * Matches a path or file token to a supported region alias.
 */
function matchRegionCandidate(candidate: string): RegionCode | null {
  const normalized = normalizeToken(candidate)

  for (const [token, regionCode] of Object.entries(REGION_ALIASES)) {
    const matcher = new RegExp(`(^|[ ._\\/-])${token}([ ._\\/-]|$)`, 'i')

    if (matcher.test(normalized)) {
      return regionCode
    }
  }

  return null
}

/**
 * Infers the dataset region from the most specific matching path segment.
 */
export function inferRegionFromPath(filePath: string): RegionCode | null {
  const pathSegments = splitPathSegments(filePath)

  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index]

    if (!segment) {
      continue
    }

    const matchedRegion = matchRegionCandidate(segment)

    if (matchedRegion) {
      return matchedRegion
    }
  }

  return null
}

/**
 * Infers the dataset region from the file name alone.
 */
export function inferRegionFromFilename(filePath: string): RegionCode | null {
  return matchRegionCandidate(basename(filePath))
}

/**
 * Normalizes a theme candidate to a supported Harbour theme.
 */
function normalizeTheme(candidate?: string | null): SupportedTheme | null {
  if (!candidate) {
    return null
  }

  return THEME_ALIASES[candidate.trim().toLowerCase()] ?? null
}

/**
 * Normalizes a type candidate to a supported Harbour dataset type.
 */
function normalizeType(candidate?: string | null): SupportedType | null {
  if (!candidate) {
    return null
  }

  return TYPE_ALIASES[candidate.trim().toLowerCase()] ?? null
}

/**
 * Normalizes a region candidate to a supported Harbour region code.
 */
function normalizeRegion(candidate?: string | null): RegionCode | null {
  if (!candidate) {
    return null
  }

  return REGION_ALIASES[candidate.trim().toLowerCase()] ?? null
}

/**
 * Infers a single supported theme from parquet content when the file is internally consistent.
 */
function inferThemeFromParquet(inspection: ParquetInspection) {
  const distinctThemes = inspection.distinctThemeValues
    .map(value => normalizeTheme(value))
    .filter((value): value is SupportedTheme => value !== null)

  const uniqueThemes = [...new Set(distinctThemes)]

  if (uniqueThemes.length !== 1) {
    return null
  }

  return uniqueThemes[0]
}

/**
 * Infers a single supported type from parquet content when the file is internally consistent.
 */
function inferTypeFromParquet(inspection: ParquetInspection) {
  const distinctTypes = inspection.distinctTypeValues
    .map(value => normalizeType(value))
    .filter((value): value is SupportedType => value !== null)

  const uniqueTypes = [...new Set(distinctTypes)]

  if (uniqueTypes.length !== 1) {
    return null
  }

  return uniqueTypes[0]
}

/**
 * Infers a single supported region from parquet content when country/region
 * columns agree.
 */
function inferRegionFromParquet(inspection: ParquetInspection) {
  const countryRegions = inspection.distinctCountryValues
    .map(value => normalizeRegion(value))
    .filter((value): value is RegionCode => value !== null)
  const regionRegions = inspection.distinctRegionValues
    .map(value => normalizeRegion(value))
    .filter((value): value is RegionCode => value !== null)
  const uniqueRegions = [...new Set([...countryRegions, ...regionRegions])]

  if (uniqueRegions.length !== 1) {
    return null
  }

  return uniqueRegions[0]
}

/**
 * Normalizes a month flag to the canonical `YYYY-MM` form.
 */
function normalizeSnapshotMonth(candidate?: string | null) {
  if (!candidate) {
    return null
  }

  const trimmed = candidate.trim()
  const match = trimmed.match(/^(20\d{2})[-_]?((0[1-9])|(1[0-2]))$/)

  if (!match) {
    return null
  }

  return `${match[1]}-${match[2]}`
}

/**
 * Produces a stable schema fingerprint used for schema drift checks.
 */
export function createSchemaFingerprint(inspection: ParquetInspection) {
  return JSON.stringify(
    inspection.schema.map(field => ({
      name: field.name,
      type: field.type,
      nullable: field.nullable,
    })),
  )
}

/**
 * Rejects uploads that are not strictly newer than the latest registered dataset.
 */
function ensureChronologicalUpload(
  latestDataset: DatasetRecord | null,
  snapshotMonth: string,
  datasetId: string,
) {
  if (!latestDataset) {
    return
  }

  if (snapshotMonth <= latestDataset.snapshotMonth) {
    throw new Error(
      [
        `Dataset ${datasetId} is not uploadable.\n\n`,
        `Latest registered dataset for this region/type is ${latestDataset.datasetId}.\n`,
        'Harbour currently only accepts strictly newer monthly uploads.\n',
        'Same-month corrected releases and backfills are not implemented yet.\n',
      ].join(' '),
    )
  }
}

/**
 * Compares the incoming parquet schema with the latest staged dataset for the
 * same region/type.
 */
async function ensureSchemaCompatible(
  latestDataset: DatasetRecord | null,
  nextInspection: ParquetInspection,
) {
  if (!latestDataset) {
    return
  }

  if (!latestDataset.rawObjectKey || !existsSync(latestDataset.rawObjectKey)) {
    throw new Error(
      [
        `Cannot validate schema drift against ${latestDataset.datasetId}.`,
        `Expected staged raw parquet at ${latestDataset.rawObjectKey}.`,
      ].join(' '),
    )
  }

  const previousInspection = await inspectParquet(latestDataset.rawObjectKey)
  const previousFingerprint = createSchemaFingerprint(previousInspection)
  const nextFingerprint = createSchemaFingerprint(nextInspection)

  if (previousFingerprint !== nextFingerprint) {
    throw new Error(
      [
        `Schema drift detected against ${latestDataset.datasetId}.`,
        'Reconcile the schema before uploading this dataset.',
      ].join(' '),
    )
  }
}

/**
 * Resolves upload metadata from flags, file naming conventions, and parquet
 * content, then validates chronology and schema compatibility.
 */
export async function planUpload(
  db: Pick<HarbourDb, 'select'>,
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
) {
  const resolvedInspection = inspection ?? (await inspectParquet(options.filePath))

  const typeFromFlag = normalizeType(options.type)
  const typeFromPath = inferTypeFromPath(options.filePath)
  const typeFromParquet = inferTypeFromParquet(resolvedInspection)
  const type = typeFromFlag ?? typeFromPath ?? typeFromParquet

  if (!type) {
    throw new Error(
      'Could not determine a supported type. Pass `--type place|division|address` or use a recognizable path/file name.',
    )
  }

  const themeFromFlag = normalizeTheme(options.theme)
  const themeFromPath = inferThemeFromPath(options.filePath) ?? TYPE_THEME_MAP[type]
  const themeFromParquet = inferThemeFromParquet(resolvedInspection)
  const theme = themeFromFlag ?? themeFromPath ?? themeFromParquet ?? TYPE_THEME_MAP[type]

  if (!theme) {
    throw new Error(
      'Could not determine a supported theme. Pass `--theme places|divisions` or use a recognizable path/file name.',
    )
  }

  const expectedThemeForType = TYPE_THEME_MAP[type]

  if (theme !== expectedThemeForType) {
    throw new Error(
      `Theme/type mismatch: inferred type ${type} belongs to theme ${expectedThemeForType}, not ${theme}.`,
    )
  }

  if (themeFromParquet && theme !== themeFromParquet) {
    throw new Error(
      `Theme mismatch: inferred ${theme} but parquet content says ${themeFromParquet}.`,
    )
  }

  if (typeFromParquet && type !== typeFromParquet) {
    throw new Error(
      `Type mismatch: inferred ${type} but parquet content says ${typeFromParquet}.`,
    )
  }

  const regionFromFlag = normalizeRegion(options.regionCode)
  const regionFromPath = inferRegionFromPath(options.filePath)
  const regionFromParquet = inferRegionFromParquet(resolvedInspection)
  const regionCode = regionFromFlag ?? regionFromPath ?? regionFromParquet

  if (!regionCode) {
    throw new Error(
      'Could not determine regionCode. Pass `--region hk|mo` or use a recognizable path/content.',
    )
  }

  const snapshotMonth =
    normalizeSnapshotMonth(options.snapshotMonth) ?? inferSnapshotMonthFromPath(options.filePath)

  if (!snapshotMonth) {
    throw new Error(
      'Could not determine snapshotMonth. Pass `--month YYYY-MM` or include it in the path.',
    )
  }

  const source = options.source ?? 'overture'
  const sourceVersion =
    options.sourceVersion ?? inferSourceVersionFromPath(options.filePath) ?? snapshotMonth
  const datasetId = `${regionCode}-${snapshotMonth}-${type}`
  const { latestDataset, supersedesDatasetId } = getLatestDatasetForTypeRegion(
    db,
    regionCode,
    type,
  )

  ensureChronologicalUpload(latestDataset, snapshotMonth, datasetId)
  await ensureSchemaCompatible(latestDataset, resolvedInspection)

  return {
    plan: {
      datasetId,
      regionCode,
      snapshotMonth,
      theme,
      type,
      source,
      sourceVersion,
      filePath: options.filePath,
      fileName: basename(options.filePath),
      rowCount: resolvedInspection.rowCount,
      schemaFingerprint: createSchemaFingerprint(resolvedInspection),
      inferredFrom: {
        theme: themeFromFlag ? 'flag' : themeFromPath ? 'path' : 'parquet',
        type: typeFromFlag ? 'flag' : typeFromPath ? 'path' : 'parquet',
        regionCode: regionFromFlag ? 'flag' : regionFromPath ? 'path' : 'parquet',
        snapshotMonth: options.snapshotMonth ? 'flag' : 'path',
      },
      supersedesDatasetId,
    } satisfies UploadPlan,
    inspection: resolvedInspection,
  }
}

/**
 * Copies the raw parquet into the local staging area and writes upload metadata.
 */
function stageRawFile(
  rawRoot: string,
  plan: UploadPlan,
  inspection: ParquetInspection,
) {
  const targetDir = join(rawRoot, plan.regionCode, plan.theme, plan.type, plan.snapshotMonth)
  const stagedFilePath = join(targetDir, plan.fileName)
  const metadataPath = join(targetDir, 'upload.json')

  mkdirSync(targetDir, { recursive: true })
  copyFileSync(plan.filePath, stagedFilePath)
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        datasetId: plan.datasetId,
        regionCode: plan.regionCode,
        snapshotMonth: plan.snapshotMonth,
        theme: plan.theme,
        type: plan.type,
        source: plan.source,
        sourceVersion: plan.sourceVersion,
        rowCount: inspection.rowCount,
        schema: inspection.schema,
      },
      null,
      2,
    ),
  )

  return { stagedFilePath, metadataPath }
}

/**
 * Registers a parquet upload locally, optionally as a dry run, and records the
 * dataset plus ingest run history in the Harbour database.
 */
export async function registerUpload(
  options: RegisterUploadOptions,
): Promise<RegisterUploadResult> {
  if (!existsSync(options.filePath)) {
    throw new Error(`File not found: ${options.filePath}`)
  }

  const { db, sqlite } = openLocalD1(options.localDbPath)

  try {
    const { plan, inspection } = await planUpload(db, options)

    if (options.dryRun) {
      return {
        plan,
        inspection,
        stagedFilePath: null,
        metadataPath: null,
      }
    }

    const existingDataset = getDatasetById(db, plan.datasetId)

    if (existingDataset) {
      throw new Error(`Dataset already exists: ${plan.datasetId}`)
    }

    const rawRoot = options.localRawRoot ?? DEFAULT_RAW_ROOT
    const { stagedFilePath, metadataPath } = stageRawFile(rawRoot, plan, inspection)
    const now = new Date().toISOString()

    db.transaction(tx => {
      insertDataset(tx, plan, stagedFilePath, now)

      insertIngestRun(
        tx,
        plan.datasetId,
        'registerDataset',
        'completed',
        JSON.stringify({
          datasetId: plan.datasetId,
          regionCode: plan.regionCode,
          snapshotMonth: plan.snapshotMonth,
          theme: plan.theme,
          type: plan.type,
        }),
        now,
        now,
      )

      insertIngestRun(
        tx,
        plan.datasetId,
        'stageRawParquet',
        'completed',
        JSON.stringify({
          rawObjectKey: stagedFilePath,
          rowCount: inspection.rowCount,
          schemaFieldCount: inspection.schema.length,
        }),
        now,
        now,
      )
    })

    return {
      plan,
      inspection,
      stagedFilePath,
      metadataPath,
    }
  } finally {
    sqlite.close()
  }
}
