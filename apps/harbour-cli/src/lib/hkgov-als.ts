import { globSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { parquetWriteFile } from 'hyparquet-writer'
import { resolveLocalD1Path } from '@repo/core/testing/local-db'

import type { UploadEnvironment } from './options.ts'
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  import.meta.dir,
  '../../../harbour-api/wrangler.jsonc',
)

const COUNTRY_NAME_ALIASES = [
  'CHINA',
  'P.R. CHINA',
  'PRC',
  'CHINA PRC',
  'CHINA, PRC',
  "THE PEOPLE'S REPUBLIC OF CHINA",
] as const

const AREA_NAME_ALIASES_EN = new Map<string, string>([
  ['HK', 'HONG KONG ISLAND'],
  ['HONG KONG', 'HONG KONG ISLAND'],
  ['KLN', 'KOWLOON'],
  ['KOWLOON', 'KOWLOON'],
  ['NT', 'NEW TERRITORIES'],
  ['NEW TERRITORIES', 'NEW TERRITORIES'],
])

const AREA_NAME_ALIASES_ZH = new Map<string, string>([
  ['香港', '香港島'],
  ['九龍', '九龍'],
  ['新界', '新界'],
])

type PrepareHkgovAlsOptions = {
  dbPath?: string
  environment: UploadEnvironment
  outputFile: string
  snapshotMonth: string
  sourceDir: string
  sourceVersion: string
}

type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  areaByZh: Map<string, string>
  countryId: string | null
  districtByEn: Map<string, string>
  districtByZh: Map<string, string>
  snapshotId: string
}

type HkgovAlsGeoJson = {
  features?: HkgovAlsFeature[]
}

type HkgovAlsFeature = {
  geometry?: {
    coordinates?: [number, number]
    type?: string
  } | null
  properties?: {
    Address?: {
      PremisesAddress?: HkgovPremisesAddress | null
    } | null
    Easting?: number | null
    Northing?: number | null
  } | null
}

type HkgovPremisesAddress = {
  BuildingCsuInformation?: {
    CsuId?: string | null
  } | null
  ChiPremisesAddress?: HkgovLocalizedPremisesAddress | null
  EngPremisesAddress?: HkgovLocalizedPremisesAddress | null
  GeoAddress?: string | null
}

type HkgovLocalizedPremisesAddress = {
  Region?: string | null
  ChiDistrict?: string | null
  EngDistrict?: string | null
  BuildingName?: string | null
  ChiEstate?: {
    EstateName?: string | null
  } | null
  EngEstate?: {
    EstateName?: string | null
  } | null
  ChiStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
  EngStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
}

type PreparedHkgovAlsRow = {
  id: string
  theme: 'addresses'
  type: 'address'
  country: 'HK'
  region: 'HK'
  snapshotMonth: string
  sourceVersion: string
  sourceFile: string
  geometry: string | null
  identifiers: string | null
  sources: string
  divisionSnapshotId: string
  areaId: string | null
  districtId: string | null
  countryId: string | null
  areaNameEn: string | null
  areaNameZhHant: string | null
  districtNameEn: string | null
  districtNameZhHant: string | null
  geoAddress: string | null
  hkgovCsuId: string | null
  chiPremisesAddressJson: string | null
  engPremisesAddressJson: string | null
  zhHantFormattedAddress: string | null
  zhHantRegion: string | null
  zhHantDistrict: string | null
  zhHantEstateName: string | null
  zhHantBuildingName: string | null
  zhHantStreetName: string | null
  zhHantStreetNumberFrom: string | null
  zhHantStreetNumberTo: string | null
  enFormattedAddress: string | null
  enRegion: string | null
  enDistrict: string | null
  enEstateName: string | null
  enBuildingName: string | null
  enStreetName: string | null
  enStreetNumberFrom: string | null
  enStreetNumberTo: string | null
  easting: number | null
  northing: number | null
}

type PreparedHkgovAlsResult = {
  featureCount: number
  outputFile: string
  sourceFileCount: number
}

type DivisionLookupSource =
  | {
      dbPath: string
      kind: 'sqlite'
    }
  | {
      databaseName: string
      kind: 'wrangler'
      mode: 'remote'
      wranglerEnv: 'preview' | 'production'
    }

export async function prepareHkgovAlsAddressParquet(
  options: PrepareHkgovAlsOptions,
): Promise<PreparedHkgovAlsResult> {
  const sourceDir = resolve(options.sourceDir)
  const outputFile = resolve(options.outputFile)
  const inputFiles = globSync(resolve(sourceDir, '*.geojson'))
    .filter(filePath => !basename(filePath).startsWith('als_addresses_3d_'))
    .sort()

  if (inputFiles.length === 0) {
    throw new Error(`No 2D ALS GeoJSON files found in ${sourceDir}.`)
  }

  const divisionMaps = await loadDivisionLookupMaps({
    dbPath: options.dbPath,
    environment: options.environment,
  })
  const rows: PreparedHkgovAlsRow[] = []

  for (const inputFile of inputFiles) {
    const payload = JSON.parse(await readFile(inputFile, 'utf8')) as HkgovAlsGeoJson
    const sourceFile = basename(inputFile)

    for (const feature of payload.features ?? []) {
      rows.push(
        normalizeHkgovAlsFeature(
          feature,
          sourceFile,
          options.snapshotMonth,
          options.sourceVersion,
          divisionMaps,
        ),
      )
    }
  }

  if (rows.length === 0) {
    throw new Error(`No address features found in ${sourceDir}.`)
  }

  await mkdir(dirname(outputFile), { recursive: true })
  parquetWriteFile({
    filename: outputFile,
    rowGroupSize: 5000,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => row.id),
        false,
      ),
      stringColumn(
        'theme',
        rows.map(row => row.theme),
        false,
      ),
      stringColumn(
        'type',
        rows.map(row => row.type),
        false,
      ),
      stringColumn(
        'country',
        rows.map(row => row.country),
        false,
      ),
      stringColumn(
        'region',
        rows.map(row => row.region),
        false,
      ),
      stringColumn(
        'snapshotMonth',
        rows.map(row => row.snapshotMonth),
        false,
      ),
      stringColumn(
        'sourceVersion',
        rows.map(row => row.sourceVersion),
        false,
      ),
      stringColumn(
        'sourceFile',
        rows.map(row => row.sourceFile),
        false,
      ),
      jsonColumn(
        'geometry',
        rows.map(row => row.geometry),
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => row.identifiers),
      ),
      jsonColumn(
        'sources',
        rows.map(row => row.sources),
        false,
      ),
      stringColumn(
        'divisionSnapshotId',
        rows.map(row => row.divisionSnapshotId),
        false,
      ),
      stringColumn(
        'areaId',
        rows.map(row => row.areaId),
      ),
      stringColumn(
        'districtId',
        rows.map(row => row.districtId),
      ),
      stringColumn(
        'countryId',
        rows.map(row => row.countryId),
      ),
      stringColumn(
        'areaNameEn',
        rows.map(row => row.areaNameEn),
      ),
      stringColumn(
        'areaNameZhHant',
        rows.map(row => row.areaNameZhHant),
      ),
      stringColumn(
        'districtNameEn',
        rows.map(row => row.districtNameEn),
      ),
      stringColumn(
        'districtNameZhHant',
        rows.map(row => row.districtNameZhHant),
      ),
      stringColumn(
        'geoAddress',
        rows.map(row => row.geoAddress),
      ),
      stringColumn(
        'hkgovCsuId',
        rows.map(row => row.hkgovCsuId),
      ),
      jsonColumn(
        'chiPremisesAddressJson',
        rows.map(row => row.chiPremisesAddressJson),
      ),
      jsonColumn(
        'engPremisesAddressJson',
        rows.map(row => row.engPremisesAddressJson),
      ),
      stringColumn(
        'zhHantFormattedAddress',
        rows.map(row => row.zhHantFormattedAddress),
      ),
      stringColumn(
        'zhHantRegion',
        rows.map(row => row.zhHantRegion),
      ),
      stringColumn(
        'zhHantDistrict',
        rows.map(row => row.zhHantDistrict),
      ),
      stringColumn(
        'zhHantEstateName',
        rows.map(row => row.zhHantEstateName),
      ),
      stringColumn(
        'zhHantBuildingName',
        rows.map(row => row.zhHantBuildingName),
      ),
      stringColumn(
        'zhHantStreetName',
        rows.map(row => row.zhHantStreetName),
      ),
      stringColumn(
        'zhHantStreetNumberFrom',
        rows.map(row => row.zhHantStreetNumberFrom),
      ),
      stringColumn(
        'zhHantStreetNumberTo',
        rows.map(row => row.zhHantStreetNumberTo),
      ),
      stringColumn(
        'enFormattedAddress',
        rows.map(row => row.enFormattedAddress),
      ),
      stringColumn(
        'enRegion',
        rows.map(row => row.enRegion),
      ),
      stringColumn(
        'enDistrict',
        rows.map(row => row.enDistrict),
      ),
      stringColumn(
        'enEstateName',
        rows.map(row => row.enEstateName),
      ),
      stringColumn(
        'enBuildingName',
        rows.map(row => row.enBuildingName),
      ),
      stringColumn(
        'enStreetName',
        rows.map(row => row.enStreetName),
      ),
      stringColumn(
        'enStreetNumberFrom',
        rows.map(row => row.enStreetNumberFrom),
      ),
      stringColumn(
        'enStreetNumberTo',
        rows.map(row => row.enStreetNumberTo),
      ),
      int32Column(
        'easting',
        rows.map(row => row.easting),
      ),
      int32Column(
        'northing',
        rows.map(row => row.northing),
      ),
    ],
  })

  return {
    featureCount: rows.length,
    outputFile,
    sourceFileCount: inputFiles.length,
  }
}

function normalizeHkgovAlsFeature(
  feature: HkgovAlsFeature,
  sourceFile: string,
  snapshotMonth: string,
  sourceVersion: string,
  divisionMaps: DivisionLookupMaps,
): PreparedHkgovAlsRow {
  const properties = feature.properties ?? {}
  const premises = properties.Address?.PremisesAddress ?? {}
  const zh = premises.ChiPremisesAddress ?? {}
  const en = premises.EngPremisesAddress ?? {}
  const zhStreet = zh.ChiStreet ?? {}
  const enStreet = en.EngStreet ?? {}
  const geoAddress = asOptionalString(premises.GeoAddress)
  const csuId =
    asOptionalString(premises.BuildingCsuInformation?.CsuId) ?? geoAddress ?? null
  const id = geoAddress ?? csuId ?? `${sourceFile}:${crypto.randomUUID()}`
  const areaNameEn = resolveAreaNameEn(en.Region)
  const areaNameZhHant = resolveAreaNameZh(zh.Region)
  const districtNameEn = asOptionalString(en.EngDistrict)
  const districtNameZhHant = asOptionalString(zh.ChiDistrict)
  const areaId =
    resolveMappedId(divisionMaps.areaByEn, areaNameEn) ??
    resolveMappedId(divisionMaps.areaByZh, areaNameZhHant)
  const districtId =
    resolveMappedId(divisionMaps.districtByEn, districtNameEn) ??
    resolveMappedId(divisionMaps.districtByZh, districtNameZhHant)
  const sources =
    stringifyJson({
      hkgovAls: {
        geoAddress,
        hkgovCsuId: csuId,
        snapshotMonth,
        sourceFile,
      },
    }) ?? '{}'

  return {
    id,
    theme: 'addresses',
    type: 'address',
    country: 'HK',
    region: 'HK',
    snapshotMonth,
    sourceVersion,
    sourceFile,
    geometry: stringifyJson(feature.geometry ?? null),
    identifiers: csuId ? stringifyJson({ hkgovCsuId: csuId }) : null,
    sources,
    divisionSnapshotId: divisionMaps.snapshotId,
    areaId,
    districtId,
    countryId: divisionMaps.countryId,
    areaNameEn,
    areaNameZhHant,
    districtNameEn,
    districtNameZhHant,
    geoAddress,
    hkgovCsuId: csuId,
    chiPremisesAddressJson: stringifyJson(zh),
    engPremisesAddressJson: stringifyJson(en),
    zhHantFormattedAddress: formatZhPremisesAddress(zh),
    zhHantRegion: asOptionalString(zh.Region),
    zhHantDistrict: districtNameZhHant,
    zhHantEstateName: asOptionalString(zh.ChiEstate?.EstateName),
    zhHantBuildingName: asOptionalString(zh.BuildingName),
    zhHantStreetName: asOptionalString(zhStreet.StreetName),
    zhHantStreetNumberFrom: asOptionalString(zhStreet.BuildingNoFrom),
    zhHantStreetNumberTo: asOptionalString(zhStreet.BuildingNoTo),
    enFormattedAddress: formatEnPremisesAddress(en),
    enRegion: asOptionalString(en.Region),
    enDistrict: districtNameEn,
    enEstateName: asOptionalString(en.EngEstate?.EstateName),
    enBuildingName: asOptionalString(en.BuildingName),
    enStreetName: asOptionalString(enStreet.StreetName),
    enStreetNumberFrom: asOptionalString(enStreet.BuildingNoFrom),
    enStreetNumberTo: asOptionalString(enStreet.BuildingNoTo),
    easting: asOptionalInteger(properties.Easting),
    northing: asOptionalInteger(properties.Northing),
  }
}

async function loadDivisionLookupMaps(options: {
  dbPath?: string
  environment: UploadEnvironment
}): Promise<DivisionLookupMaps> {
  const currentSource = resolveDivisionLookupSource(options)
  const snapshotSource = resolveDivisionSnapshotSource(options)
  const snapshotId =
    snapshotSource.kind === 'sqlite'
      ? loadPublishedDivisionSnapshotIdFromSqlite(snapshotSource.dbPath)
      : await loadPublishedDivisionSnapshotIdFromWrangler(snapshotSource)
  const rows =
    currentSource.kind === 'sqlite'
      ? loadDivisionLookupRowsFromSqlite(currentSource.dbPath, snapshotId)
      : await loadDivisionLookupRowsFromWrangler(currentSource, snapshotId)

  return buildDivisionLookupMaps(rows)
}

function loadPublishedDivisionSnapshotIdFromSqlite(explicitDbPath: string) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    const row = sqlite
      .query(
        `
          SELECT s.id AS snapshotId
          FROM snapshots s
          WHERE s.family = 'division'
            AND s.status = 'published'
          ORDER BY s.publishedAt DESC, s.createdAt DESC
          LIMIT 1
        `,
      )
      .get() as { snapshotId: string } | null

    if (!row?.snapshotId) {
      throw new Error('No published division snapshot found in meta database.')
    }

    return row.snapshotId
  } finally {
    sqlite.close()
  }
}

function loadDivisionLookupRowsFromSqlite(explicitDbPath: string, snapshotId: string) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    return sqlite
      .query(
        `
          SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
          FROM divisions d
          JOIN divisionsI18n di
            ON di.snapshotId = d.snapshotId
           AND di.divisionId = d.id
          WHERE d.snapshotId = ?
            AND di.locale IN ('en', 'zh-hant')
        `,
      )
      .all(snapshotId) as Array<DivisionLookupRow>
  } finally {
    sqlite.close()
  }
}

async function loadDivisionLookupRowsFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  snapshotId: string,
) {
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    target.databaseName,
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
      FROM divisions d
      JOIN divisionsI18n di
        ON di.snapshotId = d.snapshotId
       AND di.divisionId = d.id
      WHERE d.snapshotId = '${snapshotId}'
        AND di.locale IN ('en', 'zh-hant')
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query divisions from ${target.wranglerEnv} D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: DivisionLookupRow[]
    success?: boolean
  }>
  const firstResult = payload[0]

  if (!firstResult?.success || !Array.isArray(firstResult.results)) {
    throw new Error(
      `Unexpected Wrangler D1 response for ${target.wranglerEnv} environment.`,
    )
  }

  return firstResult.results
}

async function loadPublishedDivisionSnapshotIdFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
) {
  const metaDatabaseName =
    target.wranglerEnv === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    metaDatabaseName,
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT s.id AS snapshotId
      FROM snapshots s
      WHERE s.family = 'division'
        AND s.status = 'published'
      ORDER BY s.publishedAt DESC, s.createdAt DESC
      LIMIT 1
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query division snapshot from ${target.wranglerEnv} meta D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: Array<{
      snapshotId?: string
    }>
    success?: boolean
  }>
  const firstResult = payload[0]
  const snapshotId = firstResult?.results?.[0]?.snapshotId

  if (!firstResult?.success || !snapshotId) {
    throw new Error(
      `No published division snapshot found in ${target.wranglerEnv} meta D1.`,
    )
  }

  return snapshotId
}

export function resolveDivisionLookupSource(
  options: {
    dbPath?: string
    environment: UploadEnvironment
  },
  resolveLocalDbPath: (explicitPath?: string) => string = resolveLocalD1Path,
): DivisionLookupSource {
  if (options.dbPath) {
    return {
      dbPath: resolveLocalDbPath(options.dbPath),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'dev') {
    return {
      dbPath: resolveLocalDbPath(),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'production') {
    return {
      databaseName: 'ss-current-db-prod',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'production',
    }
  }

  return {
    databaseName: 'ss-current-db-preview',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: 'preview',
  }
}

function resolveDivisionSnapshotSource(options: {
  dbPath?: string
  environment: UploadEnvironment
}) {
  if (options.dbPath || options.environment === 'dev') {
    return {
      dbPath: resolveLocalD1Path(options.dbPath),
      kind: 'sqlite',
    } satisfies DivisionLookupSource
  }

  return {
    databaseName:
      options.environment === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: options.environment === 'production' ? 'production' : 'preview',
  } satisfies DivisionLookupSource
}

type DivisionLookupRow = {
  snapshotId: string
  id: string
  level: number
  locale: string
  name: string | null
  type: string
}

function buildDivisionLookupMaps(rows: Array<DivisionLookupRow>): DivisionLookupMaps {
  const areaByEn = new Map<string, string>()
  const areaByZh = new Map<string, string>()
  const districtByEn = new Map<string, string>()
  const districtByZh = new Map<string, string>()
  let countryId: string | null = null
  const snapshotId = rows[0]?.snapshotId ?? null

  if (!snapshotId) {
    throw new Error('No published division snapshot found in current database.')
  }

  for (const row of rows) {
    if (!row.name) {
      continue
    }

    if (row.level === 1 || row.type === 'area') {
      if (row.locale === 'en') {
        areaByEn.set(normalizeEnKey(row.name), row.id)
      }

      if (row.locale === 'zh-hant') {
        areaByZh.set(normalizeZhKey(row.name), row.id)
      }
    }

    if (row.level === 2 || row.type === 'district') {
      if (row.locale === 'en') {
        districtByEn.set(normalizeEnKey(row.name), row.id)
      }

      if (row.locale === 'zh-hant') {
        districtByZh.set(normalizeZhKey(row.name), row.id)
      }
    }

    if (row.level === 0 && row.locale === 'en') {
      const normalized = normalizeEnKey(row.name)

      if (COUNTRY_NAME_ALIASES.some(alias => normalized === normalizeEnKey(alias))) {
        countryId = row.id
      }
    }
  }

  return {
    areaByEn,
    areaByZh,
    countryId,
    districtByEn,
    districtByZh,
    snapshotId,
  }
}

function resolveMappedId(map: Map<string, string>, name: string | null) {
  if (!name) {
    return null
  }

  return map.get(normalizeEnKey(name)) ?? map.get(normalizeZhKey(name)) ?? null
}

function resolveAreaNameEn(value: unknown) {
  const normalized = asOptionalString(value)

  if (!normalized) {
    return null
  }

  return AREA_NAME_ALIASES_EN.get(normalizeEnKey(normalized)) ?? normalized
}

function resolveAreaNameZh(value: unknown) {
  const normalized = asOptionalString(value)

  if (!normalized) {
    return null
  }

  return AREA_NAME_ALIASES_ZH.get(normalizeZhKey(normalized)) ?? normalized
}

function formatZhPremisesAddress(address: HkgovLocalizedPremisesAddress) {
  const street = address.ChiStreet ?? {}
  const parts = [
    asOptionalString(address.BuildingName),
    asOptionalString(address.ChiEstate?.EstateName),
    joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, ''),
    asOptionalString(street.StreetName),
    asOptionalString(address.ChiDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, '')
}

function formatEnPremisesAddress(address: HkgovLocalizedPremisesAddress) {
  const street = address.EngStreet ?? {}
  const streetLine = compactAddress(
    [
      joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, '-'),
      asOptionalString(street.StreetName),
    ],
    ' ',
  )
  const parts = [
    asOptionalString(address.BuildingName),
    asOptionalString(address.EngEstate?.EstateName),
    streetLine,
    asOptionalString(address.EngDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, ', ')
}

function compactAddress(parts: Array<string | null>, separator: string) {
  const filtered = parts.filter((value): value is string => Boolean(value))
  return filtered.length > 0 ? filtered.join(separator) : null
}

function joinStreetNumberRange(
  from: unknown,
  to: unknown,
  separator: string,
): string | null {
  const fromValue = asOptionalString(from)
  const toValue = asOptionalString(to)

  if (!fromValue && !toValue) {
    return null
  }

  if (fromValue && toValue && fromValue !== toValue) {
    return `${fromValue}${separator}${toValue}`
  }

  return fromValue ?? toValue
}

function asOptionalString(value: unknown) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.trunc(value)
}

function normalizeEnKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizeZhKey(value: string) {
  return value.trim().replace(/\s+/g, '')
}

function stringifyJson(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(value)
}

function stringColumn(name: string, data: Array<string | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

function jsonColumn(name: string, data: Array<string | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

function int32Column(name: string, data: Array<number | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'INT32' as const,
  }
}
