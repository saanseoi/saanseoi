import {
  getDatasetById,
  hasDatasetForCohortKeySourceType,
  getLatestDatasetForRegionSourceType,
  insertDataset,
  resetFailedDataset,
  updateDatasetStatus,
  upsertIngestRunStatus,
} from '../db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '../db/types'
import type { ReleaseStatus } from '@repo/db'
import { assertKnownSafeSourceRelease } from '../../sourceSchemas'
import {
  resourceTypes,
  resourceThemes,
  type DatasetRecord,
  type ParquetInspection,
  type PreparedUploadResult,
  type RegisterUploadOptions,
  type RegisterUploadResult,
  type RegionCode,
  type ResourceTheme,
  type ResourceType,
  type UploadPlan,
} from '../../types'

const TYPE_ALIASES: Record<string, ResourceType> = {
  address: 'address',
  addresses: 'address',
  division: 'division',
  divisions: 'division',
  street: 'street',
  streets: 'street',
  place: 'place',
  places: 'place',
}

const TYPE_THEME_MAP: Record<ResourceType, ResourceTheme> = {
  address: 'addresses',
  division: 'divisions',
  street: 'streets',
  place: 'places',
}

const THEME_ALIASES: Record<string, ResourceTheme> = {
  address: 'addresses',
  addresses: 'addresses',
  division: 'divisions',
  divisions: 'divisions',
  street: 'streets',
  streets: 'streets',
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

const SOURCE_ALIASES: Record<string, string> = {
  overture: 'overture',
  'overture-maps': 'overture',
  hkgov: 'hkgov',
  'hkgov-als': 'hkgov-als',
  'hkgov als': 'hkgov-als',
  als: 'hkgov-als',
  'hk-als': 'hkgov-als',
}

const SOURCE_MATCHERS = Object.entries(SOURCE_ALIASES).sort(
  ([leftToken], [rightToken]) => rightToken.length - leftToken.length,
)

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

function directoryPathFromPath(filePath: string) {
  const segments = splitPathSegments(filePath)

  return segments.slice(0, -1).join('/')
}

function splitFileNameParts(fileName: string) {
  const trimmed = fileName.trim()
  const lastDotIndex = trimmed.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === trimmed.length - 1) {
    return {
      baseName: trimmed,
      extension: null,
    }
  }

  return {
    baseName: trimmed.slice(0, lastDotIndex),
    extension: trimmed.slice(lastDotIndex + 1).toLowerCase(),
  }
}

function normalizeSource(candidate?: string | null) {
  if (!candidate) {
    return null
  }

  return SOURCE_ALIASES[candidate.trim().toLowerCase()] ?? null
}

function normalizeUploadFileName(
  filePath: string,
  type: ResourceType,
  providedOriginalFileName?: string,
) {
  const originalFileName =
    providedOriginalFileName?.trim() || fileNameFromPath(filePath)
  const { extension } = splitFileNameParts(originalFileName)

  return {
    originalFileName,
    fileName: extension ? `${type}.${extension}` : type,
  }
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getDatasetCodeSubType(_source: string, _type: ResourceType) {
  return null
}

function buildDatasetCode(regionCode: RegionCode, source: string, type: ResourceType) {
  const subType = getDatasetCodeSubType(source, type)

  return `ds-${regionCode}-${source}-${type}${subType ? `-${subType}` : ''}`
}

function formatDatasetIdentifier(datasetCode?: string, datasetId?: string) {
  if (datasetCode?.startsWith('ds-')) {
    const match = datasetCode.match(
      /^ds-([a-z0-9]+)-(.+)-(address|division|place|street)(?:-(.+))?$/i,
    )

    if (match) {
      const [, regionCode, source, resourceType, subType] = match
      const subTypeParts = subType ? [subType] : []

      return [source, regionCode, resourceType, ...subTypeParts].join('-')
    }
  }

  return datasetCode ?? datasetId ?? 'unknown-dataset'
}

function matchSourceCandidate(candidate: string) {
  const normalized = normalizeToken(candidate)

  for (const [token, source] of SOURCE_MATCHERS) {
    const matcher = new RegExp(`(^|[ ._\\/-])${escapeRegExp(token)}([ ._\\/-]|$)`, 'i')

    if (matcher.test(normalized)) {
      return source
    }
  }

  return null
}

function matchTypeCandidate(candidate: string): ResourceType | null {
  const normalized = normalizeToken(candidate)

  for (const [token, type] of Object.entries(TYPE_ALIASES)) {
    const matcher = new RegExp(`(^|[ ._\\/-])${token}([ ._\\/-]|$)`, 'i')

    if (matcher.test(normalized)) {
      return type
    }
  }

  return null
}

function matchThemeCandidate(candidate: string): ResourceTheme | null {
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

function matchCohortKeyCandidate(candidate: string) {
  const sourceVersionMatch = candidate.match(
    /(20\d{2})-(0[1-9]|1[0-2])-[0-3]\d(?:\.\d+)?/,
  )

  if (sourceVersionMatch) {
    return sourceVersionMatch[0]
  }

  const monthlyMatch = candidate.match(/(20\d{2})-(0[1-9]|1[0-2])/)

  if (monthlyMatch) {
    return monthlyMatch[0]
  }

  return null
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

export function inferSourceVersionFromFilename(filePath: string) {
  const fileName = fileNameFromPath(filePath)
  const match = fileName.match(/(20\d{2})-(0[1-9]|1[0-2])-[0-3]\d(?:\.\d+)?/)

  if (!match) {
    return null
  }

  return match[0]
}

export function inferThemeFromPath(filePath: string): ResourceTheme | null {
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

export function inferTypeFromPath(filePath: string): ResourceType | null {
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

export function inferThemeFromFilename(filePath: string): ResourceTheme | null {
  return matchThemeCandidate(fileNameFromPath(filePath))
}

export function inferTypeFromFilename(filePath: string): ResourceType | null {
  return matchTypeCandidate(fileNameFromPath(filePath))
}

export function inferCohortKeyFromPath(filePath: string) {
  const pathSegments = splitPathSegments(filePath)

  for (const segment of pathSegments) {
    const month = matchCohortKeyCandidate(segment)

    if (month) {
      return month
    }
  }

  return null
}

export function inferCohortKeyFromFilename(filePath: string) {
  const fileName = fileNameFromPath(filePath)
  const match = matchCohortKeyCandidate(fileName)

  if (!match) {
    return null
  }

  return match
}

export function inferSourceFromPath(filePath: string) {
  const pathSegments = splitPathSegments(filePath)

  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index]

    if (!segment) {
      continue
    }

    const matchedSource = matchSourceCandidate(segment)

    if (matchedSource) {
      return matchedSource
    }
  }

  return null
}

export function inferSourceFromFilename(filePath: string) {
  return matchSourceCandidate(fileNameFromPath(filePath))
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

function normalizeTheme(candidate?: string | null): ResourceTheme | null {
  if (!candidate) {
    return null
  }

  return THEME_ALIASES[candidate.trim().toLowerCase()] ?? null
}

function normalizeType(candidate?: string | null): ResourceType | null {
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
    .filter((value): value is ResourceTheme => value !== null)

  const uniqueThemes = [...new Set(distinctThemes)]

  if (uniqueThemes.length !== 1) {
    return null
  }

  return uniqueThemes[0]
}

function inferTypeFromParquet(inspection: ParquetInspection) {
  const distinctTypes = inspection.distinctTypeValues
    .map(value => normalizeType(value))
    .filter((value): value is ResourceType => value !== null)

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

function normalizeCohortKey(candidate?: string | null) {
  if (!candidate) {
    return null
  }

  const trimmed = candidate.trim()
  if (!trimmed) {
    return null
  }

  return trimmed
}

export function createSchemaFingerprint(inspection: ParquetInspection) {
  return createSchemaFingerprintFromSchema(inspection.schema)
}

function createSchemaFingerprintFromSchema(schema: ParquetInspection['schema']) {
  return JSON.stringify(normalizeSchemaFingerprintFields(schema))
}

function compareFingerprintValue(left: string, right: string) {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function normalizeSchemaFingerprintFields(schema: ParquetInspection['schema']) {
  return schema
    .map(field => ({
      name: field.name,
      type: field.type,
      nullable: field.nullable,
    }))
    .sort((left, right) => {
      const nameComparison = compareFingerprintValue(left.name, right.name)

      if (nameComparison !== 0) {
        return nameComparison
      }

      const typeComparison = compareFingerprintValue(left.type, right.type)

      if (typeComparison !== 0) {
        return typeComparison
      }

      return Number(left.nullable) - Number(right.nullable)
    })
}

function ensureChronologicalUpload(
  latestDataset: DatasetRecord | null,
  sourceVersion: string,
  releaseCode: string,
) {
  if (!latestDataset) {
    return
  }

  if (compareSourceVersion(sourceVersion, latestDataset.sourceVersion) <= 0) {
    throw new Error(
      [
        `Release ${releaseCode} is not uploadable.\n\n`,
        `Latest registered release for this region/type is ${latestDataset.releaseCode}.\n`,
        'Harbour currently only accepts strictly newer source versions per region/source/type.\n',
        'Corrected releases and backfills must sort after the currently registered sourceVersion.\n',
      ].join(' '),
    )
  }
}

async function ensureSchemaCompatible(
  latestDataset: DatasetRecord | null,
  nextPlan: Pick<UploadPlan, 'source' | 'sourceVersion' | 'type'>,
  nextInspection: ParquetInspection,
  resolveSchemaFingerprint?: RegisterUploadOptions['resolveSchemaFingerprint'],
) {
  if (!latestDataset) {
    return
  }

  const previousFingerprint = resolveSchemaFingerprint
    ? await resolveSchemaFingerprint(
        latestDataset.rawObjectKey,
        latestDataset.releaseCode,
      )
    : null

  if (!previousFingerprint) {
    throw new Error(
      [
        `Cannot validate schema drift against ${latestDataset.releaseCode}.`,
        `Expected schema metadata for ${latestDataset.rawObjectKey}.`,
      ].join(' '),
    )
  }

  const previousSchema = parseSchemaFingerprint(previousFingerprint)
  const previousComparableFingerprint = previousSchema
    ? createSchemaFingerprintFromSchema(previousSchema)
    : previousFingerprint
  const nextFingerprint = createSchemaFingerprint(nextInspection)

  if (previousComparableFingerprint !== nextFingerprint) {
    if (
      isAllowedKnownSchemaTransition(
        latestDataset,
        nextPlan,
        previousComparableFingerprint,
        nextInspection,
      )
    ) {
      return
    }

    const schemaDiff = describeSchemaDiff(previousSchema, nextInspection.schema)

    throw new Error(
      [
        `Schema drift detected against ${latestDataset.releaseCode}.`,
        `Current upload schema has ${nextInspection.schema.length} fields; ${latestDataset.releaseCode} recorded ${previousSchema?.length ?? 'an unreadable number of'} fields.`,
        schemaDiff,
        'Reconcile the schema before uploading this dataset.',
      ].join('\n'),
    )
  }
}

async function ensureSourcePrerequisites(
  db: HarbourReadableDb,
  plan: Pick<UploadPlan, 'regionCode' | 'cohortKey' | 'source' | 'type'>,
) {
  if (plan.source !== 'hkgov-als' || plan.type !== 'address') {
    return
  }

  const overtureDataset = await hasDatasetForCohortKeySourceType(
    db,
    plan.regionCode,
    plan.cohortKey,
    'overture',
    'address',
  )

  if (!overtureDataset) {
    throw new Error(
      [
        `Cannot upload ${plan.source} ${plan.type} for ${plan.cohortKey}.`,
        'Upload the matching Overture address dataset for the same cohortKey first.',
      ].join(' '),
    )
  }
}

function resolveUploadPlan(
  options: RegisterUploadOptions,
  resolvedInspection: ParquetInspection,
) {
  const directoryPath = directoryPathFromPath(options.filePath)
  const typeFromFlag = normalizeType(options.type)
  const typeFromFilename = inferTypeFromFilename(options.filePath)
  const typeFromPath = inferTypeFromPath(directoryPath)
  const typeFromParquet = inferTypeFromParquet(resolvedInspection)
  const type = typeFromFlag ?? typeFromFilename ?? typeFromPath ?? typeFromParquet

  if (!type) {
    throw new Error(
      `Could not determine a supported type. Pass \`--type ${resourceTypes.join('|')}\` or use a recognizable path/file name.`,
    )
  }

  const themeFromFlag = normalizeTheme(options.theme)
  const themeFromFilename = inferThemeFromFilename(options.filePath)
  const themeFromPath = inferThemeFromPath(directoryPath)
  const themeFromParquet = inferThemeFromParquet(resolvedInspection)
  const theme =
    themeFromFlag ??
    themeFromFilename ??
    themeFromPath ??
    themeFromParquet ??
    TYPE_THEME_MAP[type]

  if (!theme) {
    throw new Error(
      `Could not determine a supported theme. Pass \`--theme ${resourceThemes.join('|')}\` or use a recognizable path/file name.`,
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

  const sourceFromFlag = normalizeSource(options.source)
  const sourceFromPath = inferSourceFromPath(directoryPath)
  const sourceFromFilename = inferSourceFromFilename(options.filePath)
  const source = sourceFromFlag ?? sourceFromPath ?? sourceFromFilename

  if (!source) {
    throw new Error(
      'Could not determine source. Pass `--source overture|hkgov-als` or use a recognizable path/file name.',
    )
  }
  const sourceVersionFromPath = inferSourceVersionFromPath(directoryPath)
  const sourceVersionFromFilename = inferSourceVersionFromFilename(options.filePath)
  const sourceVersion =
    options.sourceVersion ?? sourceVersionFromPath ?? sourceVersionFromFilename
  const cohortKeyFromPath = inferCohortKeyFromPath(directoryPath)
  const cohortKeyFromFilename = inferCohortKeyFromFilename(options.filePath)
  const cohortKey =
    normalizeCohortKey(options.cohortKey) ??
    cohortKeyFromPath ??
    cohortKeyFromFilename ??
    sourceVersion

  if (!cohortKey) {
    throw new Error(
      'Could not determine cohortKey. Pass `--cohort-key <value>` or include it in the path.',
    )
  }

  const resolvedSourceVersion = sourceVersion ?? cohortKey
  const { fileName, originalFileName } = normalizeUploadFileName(
    options.filePath,
    type,
    options.originalFileName,
  )
  const datasetCode = buildDatasetCode(regionCode, source, type)
  const releaseCode = `${source}-${regionCode}-${resolvedSourceVersion}-${type}`
  const plan: UploadPlan = {
    datasetId: releaseCode,
    datasetCode,
    releaseCode,
    regionCode,
    cohortKey,
    shardYear: options.shardYear?.trim() || undefined,
    theme,
    type,
    source,
    sourceVersion: resolvedSourceVersion,
    filePath: options.filePath,
    fileName,
    originalFileName,
    rowCount: resolvedInspection.rowCount,
    schemaFingerprint: createSchemaFingerprint(resolvedInspection),
    inferredFrom: {
      theme: themeFromFlag
        ? 'flag'
        : themeFromFilename
          ? 'filename'
          : themeFromPath
            ? 'path'
            : 'parquet',
      type: typeFromFlag
        ? 'flag'
        : typeFromFilename
          ? 'filename'
          : typeFromPath
            ? 'path'
            : 'parquet',
      regionCode: regionFromFlag ? 'flag' : regionFromPath ? 'path' : 'parquet',
      cohortKey: options.cohortKey
        ? 'flag'
        : cohortKeyFromPath
          ? 'path'
          : cohortKeyFromFilename
            ? 'filename'
            : 'sourceVersion',
      source: sourceFromFlag ? 'flag' : sourceFromPath ? 'path' : 'filename',
      sourceVersion: options.sourceVersion
        ? 'flag'
        : sourceVersionFromPath
          ? 'path'
          : sourceVersionFromFilename
            ? 'filename'
            : 'cohortKey',
    },
    supersedesDatasetId: null,
  }

  return {
    plan,
    inspection: resolvedInspection,
  }
}

export async function prepareUpload(
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
): Promise<PreparedUploadResult> {
  const resolvedInspection = getRequiredInspection(options, inspection)
  const preparedUpload = resolveUploadPlan(options, resolvedInspection)

  await assertKnownSafeSourceRelease({
    source: preparedUpload.plan.source,
    sourceVersion: preparedUpload.plan.sourceVersion,
  })

  return preparedUpload
}

export async function planUpload(
  db: HarbourReadableDb,
  options: RegisterUploadOptions,
  inspection?: ParquetInspection,
) {
  const resolvedInspection = getRequiredInspection(options, inspection)
  const preparedUpload = resolveUploadPlan(options, resolvedInspection)

  await assertKnownSafeSourceRelease({
    source: preparedUpload.plan.source,
    sourceVersion: preparedUpload.plan.sourceVersion,
  })

  const {
    plan: { releaseCode, regionCode, source, sourceVersion, type },
  } = preparedUpload
  const existingDataset = await getDatasetById(db, releaseCode)

  if (existingDataset) {
    assertDatasetCanBeReuploaded(existingDataset, options.allowExistingDatasetStatuses)
  }

  const { latestDataset } = await getLatestDatasetForRegionSourceType(
    db,
    regionCode,
    source,
    type,
  )

  await ensureSourcePrerequisites(db, preparedUpload.plan)
  ensureChronologicalUpload(latestDataset, sourceVersion, releaseCode)
  await ensureSchemaCompatible(
    latestDataset,
    preparedUpload.plan,
    resolvedInspection,
    options.resolveSchemaFingerprint,
  )

  return {
    ...preparedUpload,
    plan: {
      ...preparedUpload.plan,
      supersedesDatasetId: latestDataset?.releaseCode ?? null,
    },
  }
}

export function createRawObjectKey(plan: UploadPlan) {
  return [plan.regionCode, plan.source, plan.sourceVersion, plan.fileName].join('/')
}

function isAllowedKnownSchemaTransition(
  latestDataset: DatasetRecord,
  nextPlan: Pick<UploadPlan, 'source' | 'sourceVersion' | 'type'>,
  previousFingerprint: string,
  nextInspection: ParquetInspection,
) {
  if (latestDataset.source !== 'overture' || latestDataset.type !== 'division') {
    return false
  }

  if (nextPlan.source !== 'overture' || nextPlan.type !== 'division') {
    return false
  }

  if (
    compareSourceVersion(latestDataset.sourceVersion, '2026-02-18.0') >= 0 ||
    compareSourceVersion(nextPlan.sourceVersion, '2026-02-18.0') < 0
  ) {
    return false
  }

  const previousSchema = parseSchemaFingerprint(previousFingerprint)

  if (!previousSchema) {
    return false
  }

  return matchesAdminLevelTransition(previousSchema, nextInspection.schema)
}

function parseSchemaFingerprint(
  fingerprint: string,
): ParquetInspection['schema'] | null {
  try {
    const parsed = JSON.parse(fingerprint)

    if (!Array.isArray(parsed)) {
      return null
    }

    const schema = parsed
      .map(field => {
        if (
          typeof field !== 'object' ||
          field === null ||
          typeof field.name !== 'string' ||
          typeof field.type !== 'string' ||
          typeof field.nullable !== 'boolean'
        ) {
          return null
        }

        return {
          name: field.name,
          type: field.type,
          nullable: field.nullable,
        }
      })
      .filter((field): field is ParquetInspection['schema'][number] => field !== null)

    return schema.length === parsed.length ? schema : null
  } catch {
    return null
  }
}

function describeSchemaDiff(
  previousSchema: ParquetInspection['schema'] | null,
  nextSchema: ParquetInspection['schema'],
) {
  if (!previousSchema) {
    return 'Stored schema metadata could not be parsed, so Harbour cannot explain the field-level drift.'
  }

  const previousByName = new Map(previousSchema.map(field => [field.name, field]))
  const nextByName = new Map(nextSchema.map(field => [field.name, field]))
  const additions = nextSchema
    .filter(field => !previousByName.has(field.name))
    .map(field => `added \`${field.name}\` (${field.type}, nullable=${field.nullable})`)
  const removals = previousSchema
    .filter(field => !nextByName.has(field.name))
    .map(
      field => `removed \`${field.name}\` (${field.type}, nullable=${field.nullable})`,
    )
  const changes = previousSchema.flatMap(previousField => {
    const nextField = nextByName.get(previousField.name)

    if (!nextField) {
      return []
    }

    const fieldChanges: string[] = []

    if (previousField.type !== nextField.type) {
      fieldChanges.push(`type ${previousField.type} -> ${nextField.type}`)
    }

    if (previousField.nullable !== nextField.nullable) {
      fieldChanges.push(`nullable ${previousField.nullable} -> ${nextField.nullable}`)
    }

    if (fieldChanges.length === 0) {
      return []
    }

    return [`changed \`${previousField.name}\` (${fieldChanges.join(', ')})`]
  })
  const differences = [...additions, ...removals, ...changes]

  if (differences.length === 0) {
    return 'The schema fingerprint changed, but Harbour could not derive a field-level difference from the stored metadata.'
  }

  return ['Field-level differences:', ...differences.map(line => `- ${line}`)].join(
    '\n',
  )
}

function matchesAdminLevelTransition(
  previousSchema: ParquetInspection['schema'],
  nextSchema: ParquetInspection['schema'],
) {
  if (nextSchema.length !== previousSchema.length + 1) {
    return false
  }

  const previousByName = new Map(previousSchema.map(field => [field.name, field]))
  const nextByName = new Map(nextSchema.map(field => [field.name, field]))
  const addedFields = nextSchema.filter(field => !previousByName.has(field.name))

  if (
    addedFields.length !== 1 ||
    addedFields[0]?.name !== 'admin_level' ||
    addedFields[0].type !== 'int_32' ||
    addedFields[0].nullable !== true
  ) {
    return false
  }

  for (const field of previousSchema) {
    const nextField = nextByName.get(field.name)

    if (
      !nextField ||
      nextField.type !== field.type ||
      nextField.nullable !== field.nullable
    ) {
      return false
    }
  }

  return true
}

function compareSourceVersion(left: string, right: string) {
  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  return Number(leftPatch) - Number(rightPatch)
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

function assertDatasetCanBeReuploaded(
  existingDataset: {
    datasetId: string
    source?: string
    datasetCode?: string
    status: ReleaseStatus
  },
  allowedExistingStatuses: readonly ReleaseStatus[] = [],
) {
  if (existingDataset.status === 'failed') {
    return
  }

  if (allowedExistingStatuses.includes(existingDataset.status)) {
    return
  }

  const datasetIdentifier =
    existingDataset.datasetCode || existingDataset.datasetId
      ? formatDatasetIdentifier(existingDataset.datasetCode, existingDataset.datasetId)
      : existingDataset.source

  throw new Error(
    `Dataset already exists with status ${existingDataset.status}: ${datasetIdentifier}`,
  )
}

export async function registerUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
): Promise<RegisterUploadResult> {
  const { plan, inspection } = await planUpload(db, options)

  if (options.dryRun) {
    return {
      plan,
      datasetId: null,
      inspection,
      rawObjectKey: null,
      releaseId: null,
    }
  }

  const existingDataset = await getDatasetById(db, plan.releaseCode)
  const rawObjectKey = options.rawObjectKey ?? null

  if (!rawObjectKey) {
    throw new Error('A rawObjectKey is required for Worker-safe registration.')
  }

  const now = new Date().toISOString()

  if (existingDataset) {
    assertDatasetCanBeReuploaded(existingDataset, options.allowExistingDatasetStatuses)
    await resetFailedDataset(db, plan, rawObjectKey, now, 'staged')
  } else {
    await insertDataset(db, plan, rawObjectKey, now)
  }
  const release = await getDatasetById(db, plan.releaseCode)

  if (!release?.releaseId) {
    throw new Error(`Release not found after registration: ${plan.releaseCode}`)
  }

  await upsertIngestRunStatus(
    db,
    release.releaseId,
    'registerDataset',
    'completed',
    now,
    now,
    null,
  )

  await upsertIngestRunStatus(
    db,
    release.releaseId,
    'stageDataset',
    'completed',
    now,
    now,
    JSON.stringify({
      rawObjectKey,
      rowCount: inspection.rowCount,
      schemaFieldCount: inspection.schema.length,
    }),
  )

  return {
    datasetId: release.datasetId,
    plan,
    inspection,
    rawObjectKey,
    releaseId: release.releaseId,
  }
}

export async function requestUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
) {
  const { plan, inspection } = await planUpload(db, options)
  const existingDataset = await getDatasetById(db, plan.releaseCode)
  const rawObjectKey = createRawObjectKey(plan)
  const now = new Date().toISOString()

  if (existingDataset) {
    assertDatasetCanBeReuploaded(existingDataset, options.allowExistingDatasetStatuses)
    await resetFailedDataset(db, plan, rawObjectKey, now, 'uploading')
  } else {
    await insertDataset(db, plan, rawObjectKey, now, 'uploading')
  }
  const release = await getDatasetById(db, plan.releaseCode)

  if (!release?.releaseId) {
    throw new Error(`Release not found after upload request: ${plan.releaseCode}`)
  }

  await upsertIngestRunStatus(
    db,
    release.releaseId,
    'requestUpload',
    'completed',
    now,
    now,
    JSON.stringify({
      releaseCode: plan.releaseCode,
      rawObjectKey,
      rowCount: inspection.rowCount,
      schemaFingerprint: plan.schemaFingerprint,
      shardYear: plan.shardYear ?? null,
    }),
  )

  return {
    datasetId: release.datasetId,
    plan,
    inspection,
    rawObjectKey,
    releaseId: release.releaseId,
  }
}

export async function finalizeUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
) {
  const { plan, inspection } = await planUpload(
    db,
    {
      ...options,
      allowExistingDatasetStatuses: [
        ...(options.allowExistingDatasetStatuses ?? []),
        'uploading',
      ],
    },
    options.inspection,
  )
  const rawObjectKey = options.rawObjectKey ?? createRawObjectKey(plan)
  const now = new Date().toISOString()
  const release = await getDatasetById(db, plan.releaseCode)

  if (!release?.releaseId) {
    throw new Error(`Release not found: ${plan.releaseCode}`)
  }

  await updateDatasetStatus(db, release.releaseId, 'staged')
  await upsertIngestRunStatus(
    db,
    release.releaseId,
    'stageDataset',
    'completed',
    now,
    now,
    JSON.stringify({
      rawObjectKey,
      rowCount: inspection.rowCount,
      schemaFieldCount: inspection.schema.length,
    }),
  )

  return {
    datasetId: release.datasetId,
    plan,
    inspection,
    rawObjectKey,
    releaseId: release.releaseId,
  }
}
