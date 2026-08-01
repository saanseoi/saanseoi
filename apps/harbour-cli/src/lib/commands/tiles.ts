import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

import { hktReleaseDate } from '@repo/basemap'

import type { ParsedArgs } from '../cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const TILES_ROOT = resolve(REPO_ROOT, '.local/tiles')
const REPOSITORIES_ROOT = resolve(TILES_ROOT, 'repositories')
const OUTPUT_ROOT = resolve(TILES_ROOT, 'data')
const SOURCES_ROOT = resolve(TILES_ROOT, 'sources')
const BUCKET = 'ss-pmtiles'
const CLOUDFLARE_ACCOUNT_ID = 'a6eeace4b6d9f8e07ab307964e74d801'
const WRANGLER = resolve(REPO_ROOT, 'node_modules/.bin/wrangler')
const PREFIX = 'basemap'
const VIEWER_ORIGIN = 'https://viewer.saanseoi.hk'
const BROWSER_RENDER_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot`
const BASEMAPS_REPOSITORY = 'https://github.com/protomaps/basemaps.git'
const SAANSEOI_REPOSITORY = 'https://github.com/saanseoi/saanseoi.git'
const GUANGDONG_EXTRACT_URL =
  'https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf'
const GBA_SOURCE_NAME = 'gba'
const LAND_POLYGONS_URL =
  'https://osmdata.openstreetmap.de/download/land-polygons-split-3857.zip'
const LAND_POLYGONS_ARCHIVE = 'land-polygons-split-3857.zip'
const LAND_POLYGONS_SHAPEFILE =
  '/vsizip//sources/land-polygons-split-3857.zip/land-polygons-split-3857/land_polygons.shp'
const GDAL_IMAGE = 'ghcr.io/osgeo/gdal:ubuntu-small-latest'
const REGIONAL_COASTLINE_PATCH = resolve(
  import.meta.dir,
  'protomaps-regional-coastline.patch',
)

const GBA_BOUNDARY_RELATIONS = {
  guangzhou: 3287346,
  shenzhen: 3464353,
  zhuhai: 3464829,
  foshan: 3464719,
  huizhou: 3209912,
  dongguan: 3464319,
  zhongshan: 3464878,
  jiangmen: 3463901,
  zhaoqing: 3205802,
  hongKong: 913110,
  macau: 1867188,
} as const

const REGIONS = {
  gba: {
    name: 'gba',
    area: GBA_SOURCE_NAME,
    description:
      'Greater Bay Area (nine Guangdong municipalities, Hong Kong, and Macao)',
  },
  hk: { name: 'hongkong', area: 'hong kong', description: 'Hong Kong' },
  mo: { name: 'macau', area: 'macau', description: 'Macao' },
} as const

type RegionCode = keyof typeof REGIONS
type Region = (typeof REGIONS)[RegionCode] & { code: RegionCode }
const REGION_BOUNDARY_RELATIONS: Record<RegionCode, readonly number[]> = {
  gba: Object.values(GBA_BOUNDARY_RELATIONS),
  hk: [GBA_BOUNDARY_RELATIONS.hongKong],
  mo: [GBA_BOUNDARY_RELATIONS.macau],
}
type VersionEntry = {
  version: string
  tileset: string
  key: string
  manifestKey: string
  sha256: string
  size: number
  createdAt: string
}
type RegionVersions = {
  schemaVersion: 1
  region: { code: RegionCode; name: string; description: string }
  updatedAt: string
  versions: VersionEntry[]
}
type RegionsIndex = {
  schemaVersion: 1
  updatedAt: string
  regions: Array<{
    code: RegionCode
    name: string
    description: string
    versionsKey: string
  }>
}
type VersionsIndex = {
  schemaVersion: 1
  updatedAt: string
  regions: Record<string, { name: string; versionsKey: string; latest?: VersionEntry }>
}

type TilesOperation = 'backfill' | 'refresh'
type PreviewMode = 'light' | 'dark'

type NominatimGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export type NominatimBoundary = {
  osm_id: number
  geojson: NominatimGeometry
}

export async function runTilesRefreshCommand(args: ParsedArgs, printUsage: () => void) {
  const input = resolveTilesInput(args, printUsage, 'refresh')
  const regions =
    input.region.code === 'gba'
      ? ([
          { code: 'gba', ...REGIONS.gba },
          { code: 'hk', ...REGIONS.hk },
          { code: 'mo', ...REGIONS.mo },
        ] satisfies Region[])
      : [input.region]
  if (input.region.code === 'gba') await runGbaRefresh(input)
  else await runTilesCommand(input)
  for (const region of regions) {
    await renderBasemapPreviews({
      region,
      version: input.version,
      modes: ['light', 'dark'],
      dryRun: input.dryRun,
    })
  }
}

export async function runTilesRenderCommand(args: ParsedArgs, printUsage: () => void) {
  await renderBasemapPreviews(resolveTilesRenderInput(args, printUsage))
}

export async function runTilesBackfillCommand(
  args: ParsedArgs,
  printUsage: () => void,
) {
  return runTilesCommand(resolveTilesInput(args, printUsage, 'backfill'))
}

/**
 * Remove a dated release and all of its public artefacts from R2.
 *
 * A retraction is intentionally explicit: unlike `--force`, it never rebuilds
 * or replaces a release.  If the retracted release is the current pointer, the
 * pointer is unpublished rather than silently moving it to a different date.
 */
export async function runTilesRetractCommand(args: ParsedArgs, printUsage: () => void) {
  const input = resolveTilesRetractInput(args, printUsage)
  if (input.dryRun) {
    note(
      [
        `region: ${input.region.code} (${input.region.name})`,
        `version: ${input.version}`,
        `archive: ${objectKey(input.region.code, `${input.region.name}-${input.version}.pmtiles`)}`,
        `boundary: ${objectKey(input.region.code, `${input.region.name}-${input.version}.boundary.geojson`)}`,
        `manifest: ${objectKey(input.region.code, `${input.region.name}-${input.version}.json`)}`,
      ].join('\n'),
      'TILES RETRACT DRY RUN',
    )
    outro('Dry run complete')
    return
  }

  const regionVersions = await readRegionVersions(input.region)
  const entry = regionVersions.versions.find(
    version => version.version === input.version,
  )

  const versionsIndex = await readVersionsIndex()
  const current = versionsIndex.regions[input.region.code]?.latest
  const isCurrent = current?.version === input.version
  const releaseName = `${input.region.name}-${input.version}`
  const artefacts = [
    entry?.key ?? objectKey(input.region.code, `${releaseName}.pmtiles`),
    entry?.manifestKey ?? objectKey(input.region.code, `${releaseName}.json`),
    objectKey(input.region.code, `${releaseName}.boundary.geojson`),
    // Releases published before regional coastlines were embedded expose this
    // legacy, viewer-only artefact too. R2 deletion is idempotent.
    objectKey(input.region.code, `${releaseName}.land.geojson`),
  ]
  for (const key of artefacts) await deleteObject(key)

  if (isCurrent) {
    await deleteObject(
      objectKey(input.region.code, `${input.region.name}-latest.pmtiles`),
    )
    await deleteObject(
      objectKey(input.region.code, `${input.region.name}-latest.boundary.geojson`),
    )
    await deleteObject(
      objectKey(input.region.code, `${input.region.name}-latest.land.geojson`),
    )
  }

  const updatedAt = new Date().toISOString()
  regionVersions.versions = regionVersions.versions.filter(
    version => version.version !== input.version,
  )
  regionVersions.updatedAt = updatedAt
  const regionVersionsPath = resolve(OUTPUT_ROOT, input.region.code, 'versions.json')
  await writeJson(regionVersionsPath, regionVersions)
  await putObject(
    objectKey(input.region.code, 'versions.json'),
    regionVersionsPath,
    'application/json',
  )

  const regionIndex = versionsIndex.regions[input.region.code]
  if (regionIndex && isCurrent) delete regionIndex.latest
  versionsIndex.updatedAt = updatedAt
  const versionsPath = resolve(OUTPUT_ROOT, 'versions.json')
  await writeJson(versionsPath, versionsIndex)
  await putObject(`${PREFIX}/versions.json`, versionsPath, 'application/json')
  await purgeTilesHostCache()

  outro(
    !entry
      ? `Confirmed ${releaseName} is absent and purged the tiles cache`
      : isCurrent
        ? `Retracted ${releaseName} and unpublished ${input.region.name}-latest`
        : `Retracted ${releaseName}`,
  )
}

async function runTilesCommand(input: ReturnType<typeof resolveTilesInput>) {
  const outputName = `${input.region.name}-${input.version}.pmtiles`
  const outputPath = resolve(OUTPUT_ROOT, input.region.code, outputName)

  if (input.dryRun) {
    note(
      [
        `region: ${input.region.code} (${input.region.name})`,
        `version: ${input.version}`,
        `source: ${input.file ?? `Planetiler --area=${input.region.area}`}`,
        `archive: ${objectKey(input.region.code, outputName)}`,
        ...(input.operation === 'refresh'
          ? [
              `latest: ${objectKey(input.region.code, `${input.region.name}-latest.pmtiles`)}`,
              ...(input.force
                ? ['force: rebuild with Planetiler and replace the dated release']
                : []),
            ]
          : []),
      ].join('\n'),
      `TILES ${input.operation.toUpperCase()} DRY RUN`,
    )
    outro('Dry run complete')
    return
  }

  await mkdir(resolve(OUTPUT_ROOT, input.region.code), { recursive: true })
  const regionVersions = await readRegionVersions(input.region)
  const existing = regionVersions.versions.find(
    version => version.version === input.version,
  )
  if (existing && !input.force) {
    throw new Error(
      `An immutable ${input.region.code} tileset already exists for ${input.version}.`,
    )
  }

  const prepared = await prepareRegionInputs(input.region)
  const coastline = await buildRegionalCoastline(
    input.region,
    input.version,
    prepared.clip,
  )
  const build = input.file
    ? { archivePath: input.file, provenance: { type: 'backfill' as const } }
    : await buildTileset(input.region, outputPath, input.force, prepared, coastline)
  const archivePath = build.archivePath
  const archive = await archiveMetadata(archivePath)
  const boundaryName = `${input.region.name}-${input.version}.boundary.geojson`
  const boundaryPath = resolve(OUTPUT_ROOT, input.region.code, boundaryName)
  await writeJson(boundaryPath, prepared.clip.geojson)
  const boundary = await archiveMetadata(boundaryPath)
  const createdAt = new Date().toISOString()
  const archiveKey = objectKey(input.region.code, outputName)
  const latestName = `${input.region.name}-latest.pmtiles`
  const latestKey = objectKey(input.region.code, latestName)
  const latestBoundaryKey = objectKey(
    input.region.code,
    `${input.region.name}-latest.boundary.geojson`,
  )
  const manifestName = `${input.region.name}-${input.version}.json`
  const manifestKey = objectKey(input.region.code, manifestName)
  const entry: VersionEntry = {
    version: input.version,
    tileset: outputName,
    key: archiveKey,
    manifestKey,
    sha256: archive.sha256,
    size: archive.size,
    createdAt,
  }
  const manifest = {
    schemaVersion: 1,
    createdAt,
    region: input.region,
    release: {
      version: input.version,
      archive: entry,
      boundary: {
        key: objectKey(input.region.code, boundaryName),
        ...(input.operation === 'refresh' ? { latestKey: latestBoundaryKey } : {}),
        sha256: boundary.sha256,
        size: boundary.size,
        boundaryRelations: prepared.clip.boundaryRelations,
        clipBuffer: prepared.clip.buffer,
      },
      coastline: {
        source: LAND_POLYGONS_URL,
        land: coastline.land.metadata,
        water: coastline.water.metadata,
        mode: 'embedded PMTiles earth and water layers',
      },
      ...(input.operation === 'refresh' ? { latestKey } : {}),
    },
    provenance: build.provenance,
    command: process.argv.slice(2),
  }
  const manifestPath = resolve(OUTPUT_ROOT, input.region.code, manifestName)
  await writeJson(manifestPath, manifest)

  // Releases are immutable by default. --force deliberately rebuilds and replaces
  // the date-versioned archive and manifest before promoting it to latest; a
  // backfill never changes the current tileset.
  await putObject(archiveKey, archivePath, 'application/octet-stream')
  await putObject(
    objectKey(input.region.code, boundaryName),
    boundaryPath,
    'application/geo+json',
  )
  await putObject(manifestKey, manifestPath, 'application/json')
  if (input.operation === 'refresh') {
    await putObject(latestKey, archivePath, 'application/octet-stream')
    await putObject(latestBoundaryKey, boundaryPath, 'application/geo+json')
  }

  regionVersions.versions = mergeVersion(regionVersions.versions, entry)
  regionVersions.updatedAt = createdAt
  const regionVersionsPath = resolve(OUTPUT_ROOT, input.region.code, 'versions.json')
  await writeJson(regionVersionsPath, regionVersions)
  await putObject(
    objectKey(input.region.code, 'versions.json'),
    regionVersionsPath,
    'application/json',
  )

  const regionsIndex = await readRegionsIndex()
  regionsIndex.updatedAt = createdAt
  regionsIndex.regions = mergeRegion(regionsIndex.regions, input.region)
  const regionsPath = resolve(OUTPUT_ROOT, 'regions.json')
  await writeJson(regionsPath, regionsIndex)

  const versionsIndex = await readVersionsIndex()
  versionsIndex.updatedAt = createdAt
  const previousRegionIndex = versionsIndex.regions[input.region.code]
  versionsIndex.regions[input.region.code] = {
    name: input.region.name,
    versionsKey: objectKey(input.region.code, 'versions.json'),
    ...(input.operation === 'refresh'
      ? {
          latest: regionVersions.versions.find(
            version => version.version === input.version,
          ),
        }
      : previousRegionIndex?.latest
        ? { latest: previousRegionIndex.latest }
        : {}),
  }
  const versionsPath = resolve(OUTPUT_ROOT, 'versions.json')
  await writeJson(versionsPath, versionsIndex)
  await putObject(`${PREFIX}/versions.json`, versionsPath, 'application/json')
  await putObject(`${PREFIX}/regions.json`, regionsPath, 'application/json')

  outro(
    input.operation === 'refresh'
      ? `Published ${input.region.name}-${input.version} and refreshed ${latestName}`
      : `Backfilled ${input.region.name}-${input.version}`,
  )
}

async function runGbaRefresh(input: ReturnType<typeof resolveTilesInput>) {
  const regions: Region[] = [
    { code: 'gba', ...REGIONS.gba },
    { code: 'hk', ...REGIONS.hk },
    { code: 'mo', ...REGIONS.mo },
  ]

  if (input.dryRun) {
    note(
      regions
        .map(
          region =>
            `${region.code}: ${objectKey(region.code, `${region.name}-${input.version}.pmtiles`)}`,
        )
        .join('\n'),
      'GBA TILES REFRESH DRY RUN',
    )
    outro('Dry run complete')
    return
  }

  const unpublished: Region[] = []
  for (const region of regions) {
    const versions = await readRegionVersions(region)
    if (
      versions.versions.some(version => version.version === input.version) &&
      !input.force
    ) {
      note(
        `${region.name}-${input.version} is already published; reusing the existing release.`,
        'GBA TILES REFRESH',
      )
      continue
    }
    unpublished.push(region)
  }

  for (const region of unpublished) {
    await runTilesCommand({ ...input, region })
  }

  if (unpublished.length === 0) {
    outro(`All GBA tilesets are already published for ${input.version}`)
  }
}

function resolveTilesInput(
  args: ParsedArgs,
  printUsage: () => void,
  operation: TilesOperation,
) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : 'gba'
  const regionDefinition = REGIONS[rawRegion as RegionCode]
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawFile = typeof args.options.file === 'string' ? args.options.file : undefined
  const version = operation === 'backfill' ? rawDate : today()
  const allowedOptions =
    operation === 'backfill'
      ? ['region', 'date', 'file', 'dry-run']
      : ['region', 'dry-run', 'force']
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !allowedOptions.includes(key))

  if (
    !regionDefinition ||
    !version ||
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    (operation === 'backfill' && !rawFile) ||
    invalid
  ) {
    printUsage()
    throw new Error(
      operation === 'backfill'
        ? 'tiles:backfill requires --region, --date YYYY-MM-DD, and --file PATH.'
        : 'tiles:refresh accepts only --region gba|hk|mo, --dry-run, and --force.',
    )
  }

  let file: string | undefined
  if (operation === 'backfill') {
    if (!rawFile) throw new Error('tiles:backfill requires --file PATH.')
    file = resolve(process.env.SAANSEOI_INVOCATION_CWD ?? REPO_ROOT, rawFile)
  }
  if (file && !existsSync(file)) throw new Error(`Tileset file not found: ${file}`)

  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version,
    file,
    operation,
    dryRun: Boolean(args.options['dry-run']),
    force: operation === 'refresh' && Boolean(args.options.force),
  }
}

function resolveTilesRetractInput(args: ParsedArgs, printUsage: () => void) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const regionDefinition = rawRegion ? REGIONS[rawRegion as RegionCode] : undefined
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !['region', 'date', 'dry-run'].includes(key))
  if (
    !rawRegion ||
    !regionDefinition ||
    !rawDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ||
    invalid
  ) {
    printUsage()
    throw new Error('tiles:retract requires --region gba|hk|mo and --date YYYY-MM-DD.')
  }
  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version: rawDate,
    dryRun: Boolean(args.options['dry-run']),
  }
}

function resolveTilesRenderInput(args: ParsedArgs, printUsage: () => void) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const version = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawMode = typeof args.options.mode === 'string' ? args.options.mode : undefined
  const regionDefinition = rawRegion ? REGIONS[rawRegion as RegionCode] : undefined
  const mode = rawMode === 'light' || rawMode === 'dark' ? rawMode : undefined
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(
      key => !['region', 'date', 'mode', 'dry-run'].includes(key),
    ) ||
    (rawMode !== undefined && !mode)
  if (
    !rawRegion ||
    !regionDefinition ||
    !version ||
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    invalid
  ) {
    printUsage()
    throw new Error(
      'tiles:render requires --region gba|hk|mo and --date YYYY-MM-DD; --mode accepts light or dark.',
    )
  }
  const modes: PreviewMode[] = mode ? [mode] : ['light', 'dark']
  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version,
    modes,
    dryRun: Boolean(args.options['dry-run']),
  }
}

async function renderBasemapPreviews(input: {
  region: Region
  version: string
  modes: PreviewMode[]
  dryRun: boolean
}) {
  const datedNames = input.modes.map(
    mode => `${input.region.name}-${input.version}-${mode}.webp`,
  )
  if (input.dryRun) {
    note(
      [
        `region: ${input.region.code} (${input.region.name})`,
        `version: ${input.version}`,
        `viewer: ${basemapRenderUrl(input.region, input.version)}`,
        ...datedNames.map(name => `preview: ${objectKey(input.region.code, name)}`),
      ].join('\n'),
      'TILES RENDER DRY RUN',
    )
    return
  }

  const regionVersions = await readRegionVersions(input.region)
  if (!regionVersions.versions.some(entry => entry.version === input.version)) {
    throw new Error(
      `Cannot render ${input.region.name}-${input.version}: the release is not published.`,
    )
  }
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'tiles:render requires CLOUDFLARE_API_TOKEN with Browser Rendering - Edit and Workers R2 Storage - Edit permissions.',
    )
  }
  await mkdir(resolve(TILES_ROOT, 'renders'), { recursive: true })
  const latestVersion = (await readVersionsIndex()).regions[input.region.code]?.latest
    ?.version

  for (const [index, mode] of input.modes.entries()) {
    const name = datedNames[index]
    if (!name) continue
    note(
      `Rendering ${input.region.description} ${input.version} (${mode}).`,
      'BASEMAP PREVIEW',
    )
    const response = await fetch(BROWSER_RENDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: basemapRenderUrl(input.region, input.version),
        viewport: { width: 1200, height: 800, deviceScaleFactor: 1 },
        gotoOptions: { waitUntil: 'networkidle2', timeout: 60_000 },
        waitForSelector: { selector: '#basemap-render-ready', timeout: 120_000 },
        actionTimeout: 120_000,
        screenshotOptions: { type: 'webp', quality: 88, fullPage: false },
      }),
    })
    if (!response.ok) {
      throw new Error(
        `Cloudflare Browser Rendering failed (${response.status}): ${await response.text()}`,
      )
    }
    const path = resolve(TILES_ROOT, 'renders', name)
    await writeFile(path, new Uint8Array(await response.arrayBuffer()))
    await putObject(objectKey(input.region.code, name), path, 'image/webp')
    if (latestVersion === input.version) {
      await putObject(
        objectKey(input.region.code, `${input.region.name}-latest-${mode}.webp`),
        path,
        'image/webp',
      )
    }
  }
  outro(`Rendered ${input.region.name}-${input.version} basemap previews`)
}

function basemapRenderUrl(region: Region, version: string) {
  const url = new URL(VIEWER_ORIGIN)
  url.searchParams.set('headless', 'true')
  url.searchParams.set('region', region.code)
  url.searchParams.set('version', version)
  // Light and dark marketing modes deliberately share the midnight map style for now.
  url.searchParams.set('theme', 'midnight')
  url.searchParams.set('locale', 'en')
  return url.toString()
}

async function buildTileset(
  region: Region,
  outputPath: string,
  force: boolean,
  prepared: Awaited<ReturnType<typeof prepareRegionInputs>>,
  coastline: Awaited<ReturnType<typeof buildRegionalCoastline>>,
) {
  const basemaps = await updateRepository('basemaps', BASEMAPS_REPOSITORY)
  await applyBasemapRegionalCoastlinePatch(basemaps.path)
  const saanSeoiCommit = await capture(['git', '-C', REPO_ROOT, 'rev-parse', 'HEAD'])
  const image = `protomaps/basemaps:${basemaps.commit.slice(0, 12)}-regional-coastline-v1`
  const imageExists = await commandSucceeds(['docker', 'image', 'inspect', image])
  if (!imageExists) {
    await run(['docker', 'build', '--tag', image, resolve(basemaps.path, 'tiles')])
  }

  await run([
    'docker',
    'run',
    '--rm',
    '--user',
    dockerUser(),
    '--volume',
    `${resolve(OUTPUT_ROOT, region.code)}:/tiles/data`,
    '--volume',
    `${SOURCES_ROOT}:/tiles/data/sources`,
    image,
    '--download',
    `--output=data/${basename(outputPath)}`,
    `--area=${region.area}`,
    `--clip=/tiles/data/sources/${prepared.clip.fileName}`,
    '--clip-buffer=0',
    `--regional-land=/tiles/data/${basename(coastline.land.path)}`,
    `--regional-water=/tiles/data/${basename(coastline.water.path)}`,
    ...(force ? ['--force'] : []),
  ])

  return {
    archivePath: outputPath,
    provenance: {
      type: 'planetiler',
      basemaps: { repository: BASEMAPS_REPOSITORY, commit: basemaps.commit },
      saanSeoi: { repository: SAANSEOI_REPOSITORY, commit: saanSeoiCommit.trim() },
      dockerImage: image,
      regionalCoastline: 'exact pre-clipped earth and water layers',
      command: [
        '--download',
        `--output=data/${basename(outputPath)}`,
        `--area=${region.area}`,
        `--clip=/tiles/data/sources/${prepared.clip.fileName}`,
        '--clip-buffer=0',
        `--regional-land=/tiles/data/${basename(coastline.land.path)}`,
        `--regional-water=/tiles/data/${basename(coastline.water.path)}`,
        ...(force ? ['--force'] : []),
      ],
      clip: {
        fileName: prepared.clip.fileName,
        boundaryRelations: prepared.clip.boundaryRelations,
        buffer: prepared.clip.buffer,
      },
      ...(prepared.source ? { source: prepared.source } : {}),
      builtAt: new Date().toISOString(),
    },
  }
}

async function prepareRegionInputs(region: Region) {
  note(`Resolving the ${region.description} boundary.`, 'TILE CLIP')
  const boundaries = await getRegionBoundaries(region)
  const clip = await prepareRegionClip(region, boundaries)
  const source = region.code === 'gba' ? await prepareGbaSource(boundaries) : undefined
  return { clip, source }
}

/**
 * Build coastline-accurate earth and water layers for the exact release area.
 *
 * This is deliberately separate from the administrative clipping boundary:
 * coastal administrative boundaries contain territorial water, whereas this
 * artefact contains only OSM's land polygons intersected with that boundary. The
 * complementary water geometry is the boundary minus those land polygons. Both are
 * fed directly into the PMTiles build, before tile simplification and clipping.
 */
async function buildRegionalCoastline(
  region: Region,
  version: string,
  clip: Awaited<ReturnType<typeof prepareRegionClip>>,
) {
  const archivePath = resolve(SOURCES_ROOT, LAND_POLYGONS_ARCHIVE)
  if (!existsSync(archivePath)) {
    note('Downloading global coastline land polygons.', 'LAND COVERAGE')
    await downloadFile(LAND_POLYGONS_URL, archivePath)
  }

  const landName = `${region.name}-${version}.coastline-land.geojson`
  const waterName = `${region.name}-${version}.coastline-water.geojson`
  const landPath = resolve(OUTPUT_ROOT, region.code, landName)
  const waterPath = resolve(OUTPUT_ROOT, region.code, waterName)
  const regionOutput = resolve(OUTPUT_ROOT, region.code)
  note(`Building exact coastline layers for ${region.description}.`, 'COASTLINE')
  await run([
    'docker',
    'run',
    '--rm',
    '--user',
    dockerUser(),
    '--volume',
    `${SOURCES_ROOT}:/sources:ro`,
    '--volume',
    `${regionOutput}:/output`,
    GDAL_IMAGE,
    'sh',
    '-ceu',
    [
      'rm -f /tmp/regional-coastline.gpkg',
      `rm -f /output/${landName} /output/${waterName}`,
      `ogr2ogr -makevalid -f GPKG /tmp/regional-coastline.gpkg /sources/${clip.fileName} -nln boundary -t_srs EPSG:3857`,
      `ogr2ogr -makevalid -update -append /tmp/regional-coastline.gpkg ${LAND_POLYGONS_SHAPEFILE} -nln land -clipsrc /tmp/regional-coastline.gpkg -t_srs EPSG:3857`,
      `ogr2ogr -makevalid -f GeoJSON -t_srs EPSG:4326 /output/${landName} /tmp/regional-coastline.gpkg land`,
      `ogr2ogr -makevalid -f GeoJSON -t_srs EPSG:4326 -dialect sqlite -sql "SELECT ST_Difference((SELECT geom FROM boundary), ST_Union(geom)) AS geometry FROM land" /output/${waterName} /tmp/regional-coastline.gpkg`,
    ].join('\n'),
  ])
  return {
    land: { path: landPath, metadata: await archiveMetadata(landPath) },
    water: { path: waterPath, metadata: await archiveMetadata(waterPath) },
  }
}

async function prepareRegionClip(region: Region, boundaries: NominatimBoundary[]) {
  await mkdir(SOURCES_ROOT, { recursive: true })
  const fileName = `${region.code}.clip.geojson`
  const path = resolve(SOURCES_ROOT, fileName)
  const geojson = boundariesToClipGeoJson(boundaries)
  await writeFile(path, `${JSON.stringify(geojson)}\n`, 'utf8')
  return {
    fileName,
    boundaryRelations: REGION_BOUNDARY_RELATIONS[region.code],
    buffer: 0,
    geojson,
  }
}

async function prepareGbaSource(boundaries: NominatimBoundary[]) {
  await mkdir(SOURCES_ROOT, { recursive: true })
  const guangdongPath = resolve(SOURCES_ROOT, 'guangdong-latest.osm.pbf')
  const polygonPath = resolve(SOURCES_ROOT, `${GBA_SOURCE_NAME}.poly`)
  const outputPath = resolve(SOURCES_ROOT, `${GBA_SOURCE_NAME}.osm.pbf`)

  if (!(await commandSucceeds(['osmium', '--version']))) {
    throw new Error(
      'GBA refresh requires osmium on PATH. Install osmium-tool and retry.',
    )
  }

  note('Downloading the GeoFabrik Guangdong source extract.', 'GBA SOURCE')
  await downloadFile(GUANGDONG_EXTRACT_URL, guangdongPath)
  await writeFile(polygonPath, boundariesToOsmiumPolygon(boundaries), 'utf8')
  note('Extracting the Greater Bay Area with complete ways.', 'GBA SOURCE')
  await run([
    'osmium',
    'extract',
    '--strategy=complete_ways',
    `--polygon=${polygonPath}`,
    `--output=${outputPath}`,
    '--overwrite',
    guangdongPath,
  ])
  note('Greater Bay Area source is ready for Planetiler.', 'GBA SOURCE')

  return {
    upstream: GUANGDONG_EXTRACT_URL,
    boundaryRelations: GBA_BOUNDARY_RELATIONS,
    extractionStrategy: 'osmium complete_ways',
  }
}

async function downloadFile(url: string, path: string) {
  const temporaryPath = `${path}.download`
  await run([
    'curl',
    '--fail',
    '--location',
    '--retry',
    '3',
    '--output',
    temporaryPath,
    url,
  ])
  await rename(temporaryPath, path)
}

async function getRegionBoundaries(region: Region) {
  const relationIds = REGION_BOUNDARY_RELATIONS[region.code]
  const url = new URL('https://nominatim.openstreetmap.org/lookup')
  url.searchParams.set('osm_ids', relationIds.map(id => `R${id}`).join(','))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('polygon_geojson', '1')

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SaanSeoi tiles boundary preparation/1.0 (https://saanseoi.hk)',
    },
  })
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${region.description} boundaries: ${response.status} ${response.statusText}`,
    )
  }

  const boundaries = (await response.json()) as NominatimBoundary[]
  const found = new Set(boundaries.map(boundary => boundary.osm_id))
  const missing = relationIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw new Error(
      `Could not resolve ${region.description} boundary relations: ${missing.join(', ')}`,
    )
  }

  return relationIds.map(id => {
    const boundary = boundaries.find(candidate => candidate.osm_id === id)
    if (!boundary) throw new Error(`Missing boundary relation ${id}.`)
    return boundary
  })
}

export function boundariesToOsmiumPolygon(boundaries: NominatimBoundary[]) {
  const rings: string[] = []
  let ringIndex = 0

  for (const boundary of boundaries) {
    const polygons =
      boundary.geojson.type === 'Polygon'
        ? [boundary.geojson.coordinates]
        : boundary.geojson.coordinates

    for (const polygon of polygons) {
      for (const [index, ring] of polygon.entries()) {
        if (ring.length < 4 || ring.some(point => point.length < 2)) {
          throw new Error(`Invalid polygon ring for OSM relation ${boundary.osm_id}`)
        }
        ringIndex += 1
        rings.push(
          `${index === 0 ? '' : '!'}${ringIndex}\n${ring
            .map(([longitude, latitude]) => `${longitude} ${latitude}`)
            .join('\n')}\nEND`,
        )
      }
    }
  }

  return `gba\n${rings.join('\n')}\nEND\n`
}

export function boundariesToClipGeoJson(boundaries: NominatimBoundary[]) {
  if (boundaries.length === 0)
    throw new Error('Cannot create a clip from no boundaries.')

  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const geometries = boundaries
    .map(boundary => reader.read(JSON.stringify(boundary.geojson)))
    .sort((left, right) =>
      left.getEnvelopeInternal().compareTo(right.getEnvelopeInternal()),
    )
  const unioned = unionBalanced(geometries)
  if (!IsValidOp.isValid(unioned)) {
    throw new Error('Region boundary union did not produce a valid clipping geometry.')
  }
  const geometry = writer.write(unioned) as NominatimGeometry
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    throw new Error('Region boundary union produced unsupported geometry.')
  }
  return { type: 'Feature' as const, properties: {}, geometry }
}

function unionBalanced(geometries: Geometry[]): Geometry {
  let current = geometries
  while (current.length > 1) {
    const next: Geometry[] = []
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]
      const right = current[index + 1]
      if (!left) throw new Error('Region boundary union is empty.')
      next.push(right ? UnionOp.union(left, right) : left)
    }
    current = next
  }
  const result = current[0]
  if (!result) throw new Error('Region boundary union is empty.')
  return result
}

async function updateRepository(name: string, repository: string) {
  await mkdir(REPOSITORIES_ROOT, { recursive: true })
  const path = resolve(REPOSITORIES_ROOT, name)
  if (!existsSync(resolve(path, '.git'))) {
    await run(['git', 'clone', '--depth', '1', '--branch', 'main', repository, path])
  } else {
    await run(['git', '-C', path, 'fetch', '--depth', '1', 'origin', 'main'])
    await run(['git', '-C', path, 'checkout', '--detach', 'FETCH_HEAD'])
  }
  return {
    path,
    commit: (await capture(['git', '-C', path, 'rev-parse', 'HEAD'])).trim(),
  }
}

async function applyBasemapRegionalCoastlinePatch(path: string) {
  const alreadyApplied = await commandSucceeds([
    'git',
    '-C',
    path,
    'apply',
    '--reverse',
    '--check',
    REGIONAL_COASTLINE_PATCH,
  ])
  if (alreadyApplied) return
  await run([
    'git',
    '-C',
    path,
    'apply',
    '--whitespace=nowarn',
    REGIONAL_COASTLINE_PATCH,
  ])
}

async function archiveMetadata(path: string) {
  const [info, bytes] = await Promise.all([stat(path), readFile(path)])
  return { size: info.size, sha256: createHash('sha256').update(bytes).digest('hex') }
}

async function readRegionVersions(region: Region): Promise<RegionVersions> {
  const value = await getJson<RegionVersions>(objectKey(region.code, 'versions.json'))
  return (
    value ?? {
      schemaVersion: 1,
      region: { code: region.code, name: region.name, description: region.description },
      updatedAt: new Date(0).toISOString(),
      versions: [],
    }
  )
}

async function readRegionsIndex(): Promise<RegionsIndex> {
  return (
    (await getJson<RegionsIndex>(`${PREFIX}/regions.json`)) ?? {
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
      regions: [],
    }
  )
}

async function readVersionsIndex(): Promise<VersionsIndex> {
  return (
    (await getJson<VersionsIndex>(`${PREFIX}/versions.json`)) ?? {
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
      regions: {},
    }
  )
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const path = resolve(TILES_ROOT, 'catalogue', key.replaceAll('/', '__'))
  await mkdir(resolve(path, '..'), { recursive: true })
  const result = await runQuiet([
    ...wranglerCommand(),
    'r2',
    'object',
    'get',
    `${BUCKET}/${key}`,
    '--remote',
    '--file',
    path,
  ])
  if (result.exitCode !== 0) {
    if (!result.stderr.trim() && !result.stdout.trim()) {
      return undefined
    }
    if (/not found|does not exist|no such object/i.test(result.stderr)) return undefined
    throw commandError(
      [...wranglerCommand(), 'r2', 'object', 'get', `${BUCKET}/${key}`],
      result.stderr,
      result.stdout,
    )
  }
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function putObject(key: string, file: string, contentType: string) {
  await run([
    ...wranglerCommand(),
    'r2',
    'object',
    'put',
    `${BUCKET}/${key}`,
    '--remote',
    '--file',
    file,
    '--content-type',
    contentType,
  ])
}

async function deleteObject(key: string) {
  await run([
    ...wranglerCommand(),
    'r2',
    'object',
    'delete',
    `${BUCKET}/${key}`,
    '--remote',
  ])
}

/** Invalidate CDN and Worker Cache API entries after retracting an archive. */
async function purgeTilesHostCache() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'The release was removed from R2, but its cached URLs were not purged: CLOUDFLARE_API_TOKEN is required.',
    )
  }
  const zoneName = process.env.CLOUDFLARE_ZONE_NAME ?? 'saanseoi.hk'
  const zones = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&status=active`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const zoneResult = (await zones.json()) as {
    success?: boolean
    result?: Array<{ id?: string }>
  }
  const zoneId = zoneResult.result?.[0]?.id
  if (!zones.ok || !zoneResult.success || !zoneId) {
    throw new Error(
      `The release was removed from R2, but the ${zoneName} zone could not be resolved for cache purging.`,
    )
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hosts: ['tiles.saanseoi.hk'] }),
    },
  )
  const result = (await response.json()) as { success?: boolean }
  if (!response.ok || !result.success) {
    throw new Error(
      'The release was removed from R2, but the tiles cache could not be purged. Grant the token Zone > Cache Purge > Purge permission and retry the same tiles:retract command.',
    )
  }
}

function mergeVersion(versions: VersionEntry[], entry: VersionEntry) {
  return [...versions.filter(version => version.version !== entry.version), entry].sort(
    (a, b) => b.version.localeCompare(a.version),
  )
}

function mergeRegion(regions: RegionsIndex['regions'], region: Region) {
  const entry = {
    code: region.code,
    name: region.name,
    description: region.description,
    versionsKey: objectKey(region.code, 'versions.json'),
  }
  return [...regions.filter(candidate => candidate.code !== region.code), entry].sort(
    (a, b) => a.code.localeCompare(b.code),
  )
}

function objectKey(region: RegionCode, name: string) {
  return `${PREFIX}/${region}/${name}`
}

async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function today() {
  return hktReleaseDate()
}

function dockerUser() {
  if (!process.getuid || !process.getgid) {
    throw new Error(
      'Tile builds require a POSIX user identity for Docker output ownership.',
    )
  }
  return `${process.getuid()}:${process.getgid()}`
}

async function commandSucceeds(command: string[]) {
  return (await runQuiet(command)).exitCode === 0
}

async function capture(command: string[]) {
  const result = await runQuiet(command)
  if (result.exitCode !== 0) throw commandError(command, result.stderr, result.stdout)
  return result.stdout
}

async function run(command: string[]) {
  const process = Bun.spawn({
    cmd: command,
    cwd: REPO_ROOT,
    env: cloudflareEnvironment(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await process.exited
  if (exitCode !== 0)
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`)
}

async function runQuiet(command: string[]) {
  const process = Bun.spawn({
    cmd: command,
    cwd: REPO_ROOT,
    env: cloudflareEnvironment(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { stdout, stderr, exitCode }
}

function cloudflareEnvironment() {
  return {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? CLOUDFLARE_ACCOUNT_ID,
  }
}

function wranglerCommand() {
  if (!existsSync(WRANGLER)) {
    throw new Error(
      `Local Wrangler binary not found: ${WRANGLER}. Run bun install first.`,
    )
  }
  return [WRANGLER]
}

function commandError(command: string[], stderr: string, stdout: string) {
  return new Error(
    `Command failed: ${command.join(' ')}\n${stderr.trim() || stdout.trim()}`,
  )
}
