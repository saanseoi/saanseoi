import {
  type HarbourReadableDb,
  type HarbourWritableDb,
  getDatasetById,
  getLatestDatasetForTypeRegion,
  insertDataset,
  insertIngestRun,
} from '../db/repository'
import type {
  DatasetRecord,
  ParquetInspection,
  PreparedUploadResult,
  RegisterUploadOptions,
  RegisterUploadResult,
  RegionCode,
  SupportedTheme,
  SupportedType,
  UploadPlan,
} from '../../types'

const TYPE_ALIASES: Record<string, SupportedType> = {
  address: 'address',
  addresses: 'address',
  division: 'division',
  divisions: 'division',
  place: 'place',
  places: 'place',
}

const TYPE_THEME_MAP: Record<SupportedType, SupportedTheme> = {
  address: 'addresses',
  division: 'divisions',
  place: 'places',
}

const THEME_ALIASES: Record<string, SupportedTheme> = {
  address: 'addresses',
  addresses: 'addresses',
  division: 'divisions',
  divisions: 'divisions',
  place: 'places',
  places: 'places',
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

function splitPathSegments(filePath: string) {
  return filePath
    .split(/[\\/]+/)
    .map(segment => segment.trim())
    .filter(Boolean)
}

function fileNameFromPath(filePath: string) {
  const segments = splitPathSegments(filePath)

  return segments.at(-1) ?? filePath
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

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

export function inferThemeFromFilename(filePath: string): SupportedTheme | null {
  return matchThemeCandidate(fileNameFromPath(filePath))
}

export function inferTypeFromFilename(filePath: string): SupportedType | null {
  return matchTypeCandidate(fileNameFromPath(filePath))
}

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

export function inferSnapshotMonthFromFilename(filePath: string) {
  const fileName = fileNameFromPath(filePath)
  const match = matchSnapshotMonthCandidate(fileName)

  if (!match) {
    return null
  }

  return match
}

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

export function inferRegionFromFilename(filePath: string): RegionCode | null {
  return matchRegionCandidate(fileNameFromPath(filePath))
}

function normalizeTheme(candidate?: string | null): SupportedTheme | null {
  if (!candidate) {
    return null
  }

  return THEME_ALIASES[candidate.trim().toLowerCase()] ?? null
}

function normalizeType(candidate?: string | null): SupportedType | null {
  if (!candidate) {
    return null
  }

  return TYPE_ALIASES[candidate.trim().toLowerCase()] ?? null
}

function normalizeRegion(candidate?: string | null): RegionCode | null {
  if (!candidate) {
    return null
  }

  return REGION_ALIASES[candidate.trim().toLowerCase()] ?? null
}

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

export function createSchemaFingerprint(inspection: ParquetInspection) {
  return JSON.stringify(
    inspection.schema.map(field => ({
      name: field.name,
      type: field.type,
      nullable: field.nullable,
    })),
  )
}

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

async function ensureSchemaCompatible(
  latestDataset: DatasetRecord | null,
  nextInspection: ParquetInspection,
  resolveSchemaFingerprint?: RegisterUploadOptions['resolveSchemaFingerprint'],
) {
  if (!latestDataset) {
    return
  }

  const previousFingerprint = resolveSchemaFingerprint
    ? await resolveSchemaFingerprint(
        latestDataset.rawObjectKey,
        latestDataset.datasetId,
      )
    : null

  if (!previousFingerprint) {
    throw new Error(
      [
        `Cannot validate schema drift against ${latestDataset.datasetId}.`,
        `Expected schema metadata for ${latestDataset.rawObjectKey}.`,
      ].join(' '),
    )
  }

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

function resolveUploadPlan(
  options: RegisterUploadOptions,
  resolvedInspection: ParquetInspection,
  supersedesDatasetId: string | null,
) {
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
  const theme =
    themeFromFlag ?? themeFromPath ?? themeFromParquet ?? TYPE_THEME_MAP[type]

  if (!theme) {
    throw new Error(
      'Could not determine a supported theme. Pass `--theme addresses|places|divisions` or use a recognizable path/file name.',
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
    normalizeSnapshotMonth(options.snapshotMonth) ??
    inferSnapshotMonthFromPath(options.filePath)

  if (!snapshotMonth) {
    throw new Error(
      'Could not determine snapshotMonth. Pass `--month YYYY-MM` or include it in the path.',
    )
  }

  const source = options.source ?? 'overture'
  const sourceVersion =
    options.sourceVersion ??
    inferSourceVersionFromPath(options.filePath) ??
    snapshotMonth
  const datasetId = `${regionCode}-${snapshotMonth}-${type}`

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
      fileName: fileNameFromPath(options.filePath),
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

export async function prepareUpload(
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
): Promise<PreparedUploadResult> {
  const resolvedInspection = getRequiredInspection(options, inspection)

  return resolveUploadPlan(options, resolvedInspection, null)
}

export async function planUpload(
  db: HarbourReadableDb,
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
) {
  const resolvedInspection = getRequiredInspection(options, inspection)
  const preparedUpload = resolveUploadPlan(options, resolvedInspection, null)
  const {
    plan: { datasetId, regionCode, snapshotMonth, type },
  } = preparedUpload
  const { latestDataset, supersedesDatasetId } = await getLatestDatasetForTypeRegion(
    db,
    regionCode,
    type,
  )

  ensureChronologicalUpload(latestDataset, snapshotMonth, datasetId)
  await ensureSchemaCompatible(
    latestDataset,
    resolvedInspection,
    options.resolveSchemaFingerprint,
  )

  return resolveUploadPlan(options, resolvedInspection, supersedesDatasetId)
}

export function createRawObjectKey(plan: UploadPlan) {
  return [
    'raw',
    plan.regionCode,
    plan.theme,
    plan.type,
    plan.snapshotMonth,
    plan.sourceVersion,
    plan.fileName,
  ].join('/')
}

function getRequiredInspection(
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
) {
  const resolvedInspection = inspection ?? options.inspection

  if (!resolvedInspection) {
    throw new Error(
      'A parquet inspection is required in Worker-safe upload flows. Use the CLI-local upload service for file-based inspection.',
    )
  }

  return resolvedInspection
}

export async function registerUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
): Promise<RegisterUploadResult> {
  const { plan, inspection } = await planUpload(db, options)

  if (options.dryRun) {
    return {
      plan,
      inspection,
      rawObjectKey: null,
      stagedFilePath: null,
      metadataPath: null,
    }
  }

  const existingDataset = await getDatasetById(db, plan.datasetId)

  if (existingDataset) {
    throw new Error(`Dataset already exists: ${plan.datasetId}`)
  }

  const stagedFilePath = null
  const metadataPath = options.metadataPath ?? null
  const rawObjectKey = options.rawObjectKey ?? null

  if (!rawObjectKey) {
    throw new Error(
      'A rawObjectKey is required for Worker-safe registration. Use the CLI-local upload service for filesystem staging.',
    )
  }

  const now = new Date().toISOString()

  await insertDataset(db, plan, rawObjectKey, now)

  await insertIngestRun(
    db,
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

  await insertIngestRun(
    db,
    plan.datasetId,
    'stageRawParquet',
    'completed',
    JSON.stringify({
      rawObjectKey,
      rowCount: inspection.rowCount,
      schemaFieldCount: inspection.schema.length,
    }),
    now,
    now,
  )

  return {
    plan,
    inspection,
    rawObjectKey,
    stagedFilePath,
    metadataPath,
  }
}
