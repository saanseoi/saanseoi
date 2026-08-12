import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import ArrayList from 'jsts/java/util/ArrayList.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import PointLocator from 'jsts/org/locationtech/jts/algorithm/PointLocator.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'

import {
  BASEMAP_SCHEMA_VERSION,
  hktReleaseDate,
  mapStyleIds,
  type MapStyleId,
} from '@repo/basemap'

import type { ParsedArgs } from '../cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const TILES_ROOT = resolve(REPO_ROOT, '.local/tiles')
const REPOSITORIES_ROOT = resolve(TILES_ROOT, 'repositories')
const OUTPUT_ROOT = resolve(TILES_ROOT, 'data')
const SOURCES_ROOT = resolve(TILES_ROOT, 'sources')
const HISTORICAL_SOURCES_ROOT = resolve(TILES_ROOT, 'historical', 'sources')
const BUCKET = 'ss-pmtiles'
const SOURCE_BUCKET = 'ss-basemap-sources'
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
    description: 'Greater Bay Area',
  },
  hk: { name: 'hongkong', area: 'hong kong', description: 'Hong Kong' },
  mo: { name: 'macau', area: 'macau', description: 'Macao' },
} as const

type RegionCode = keyof typeof REGIONS
type Region = (typeof REGIONS)[RegionCode] & { code: RegionCode }
const REGION_PROCESSING_ORDER = [
  'gba',
  'hk',
  'mo',
] as const satisfies readonly RegionCode[]
type PreparedSource = {
  path: string
  planetilerArea: string
  upstream: string
  /** Complete OSM context used only to resolve boundary relation members. */
  borderSourcePath?: string
  boundaryRelations?: typeof GBA_BOUNDARY_RELATIONS
  extractionStrategy?: string
  sourceArchive?: {
    bucket: typeof SOURCE_BUCKET
    key: string
    sha256: string
    size: number
    sourceUrl: string
  }
}
type HistoricalSources = {
  primary: string
  /** Complete GBA context required by Macao's cross-boundary relation. */
  border?: string
}
type CoastlineGeometry = Geometry & {
  isEmpty(): boolean
  getGeometryType(): string
  getCoordinates(): Array<{ x: number; y: number }>
  getBoundary(): CoastlineGeometry
}
const REGION_BOUNDARY_RELATIONS: Record<RegionCode, readonly number[]> = {
  gba: Object.values(GBA_BOUNDARY_RELATIONS),
  hk: [GBA_BOUNDARY_RELATIONS.hongKong],
  mo: [GBA_BOUNDARY_RELATIONS.macau],
}

function regionsInProcessingOrder(): Region[] {
  return REGION_PROCESSING_ORDER.map(code => ({ code, ...REGIONS[code] }))
}

function regionProcessingIndex(region: RegionCode) {
  const index = REGION_PROCESSING_ORDER.indexOf(region)
  if (index === -1) throw new Error(`Unknown tile region: ${region}`)
  return index
}

const LEGACY_IMPORTED_RELEASES = new Set(['hk:2025-04-25', 'hk:2026-03-18'])
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

type TilesOperation = 'import' | 'rebuild' | 'refresh'
type PreviewMode = 'light' | 'dark' | 'postcard' | 'postcard-lit'
type StylePreviewCamera = { landmark: string; lng: number; lat: number }
type StylePreviewCameras = Record<16 | 19, StylePreviewCamera>

const STYLE_PREVIEW_CAMERAS: Record<RegionCode, StylePreviewCameras> = {
  gba: {
    16: { landmark: 'canton-tower', lng: 113.3247, lat: 23.1065 },
    19: { landmark: 'canton-tower', lng: 113.3247, lat: 23.1065 },
  },
  hk: {
    16: { landmark: 'central', lng: 114.1584, lat: 22.2855 },
    19: { landmark: 'hollywood-road', lng: 114.1535551, lat: 22.2821544 },
  },
  mo: {
    16: { landmark: 'senado-square', lng: 113.5439, lat: 22.1933 },
    19: { landmark: 'senado-square', lng: 113.5439, lat: 22.1933 },
  },
}

type BoundaryGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export type OsmBoundary = {
  osm_id: number
  geojson: BoundaryGeometry
}

export async function runTilesRefreshCommand(args: ParsedArgs, printUsage: () => void) {
  const input = resolveTilesInput(args, printUsage, 'refresh')
  const regions =
    input.region.code === 'gba' ? regionsInProcessingOrder() : [input.region]
  if (input.region.code === 'gba') await runGbaRefresh(input)
  else await runTilesCommand(input)
  for (const region of regions) {
    await renderBasemapPreviews({
      region,
      version: input.version,
      modes: ['light', 'dark', 'postcard', 'postcard-lit'],
      dryRun: input.dryRun,
    })
    await renderStyleLibraryPreviews(region, input.version, input.dryRun)
  }
}

export async function runTilesRenderCommand(args: ParsedArgs, printUsage: () => void) {
  const input = resolveTilesRenderInput(args, printUsage)
  await renderBasemapPreviews(input)
  await renderStyleLibraryPreviews(input.region, input.version, input.dryRun)
}

export async function runTilesImportCommand(args: ParsedArgs, printUsage: () => void) {
  return runTilesCommand(resolveTilesInput(args, printUsage, 'import'))
}

/**
 * Rebuild every published regional release from the current tile pipeline.
 *
 * @param args Parsed command-line arguments.
 * @param printUsage Prints the CLI usage summary when arguments are invalid.
 * @returns A promise that resolves after every archive and preview is rebuilt.
 * @remarks This deliberately replaces immutable pre-release history only when
 * `--rewrite-history` is supplied. Source-backed releases use their locally archived
 * GeoFabrik PBF; imported archives are retained and never replaced by this command.
 */
export async function runTilesRebuildCommand(args: ParsedArgs, printUsage: () => void) {
  const input = resolveTilesRebuildInput(args, printUsage)
  if (input.version) return runTilesDateRebuild(input)
  const versionsIndex = await readVersionsIndex()
  const releases = (
    await Promise.all(
      REGION_PROCESSING_ORDER.map(async code => {
        const region = { code, ...REGIONS[code] }
        const versions = await readRegionVersions(region)
        return Promise.all(
          versions.versions.map(async version => {
            const source = await findHistoricalSource(region, version.version)
            return {
              region,
              version: version.version,
              source: source.path,
              sourceError: source.error,
              imported: await isImportedRelease(region, version.version),
              promoteLatest:
                versionsIndex.regions[code]?.latest?.version === version.version,
            }
          }),
        )
      }),
    )
  )
    .flat()
    .sort(
      (left, right) =>
        right.version.localeCompare(left.version) ||
        regionProcessingIndex(left.region.code) -
          regionProcessingIndex(right.region.code),
    )

  const sourceBackedReleases = releases.filter(
    release => release.source && !release.imported,
  )
  const unavailableReleases = releases.filter(
    release => !release.source && !release.imported,
  )
  if (sourceBackedReleases.length === 0)
    throw new Error('No published PMTiles releases to rebuild.')

  if (input.dryRun) {
    note(
      releases
        .map(release => {
          const name = `${release.region.name}-${release.version}`
          const flags = [
            release.promoteLatest ? 'latest' : undefined,
            release.imported
              ? 'imported; retained'
              : release.source
                ? undefined
                : 'historical source missing; not rebuildable',
          ].filter(Boolean)
          return `${release.region.code}: ${name}${flags.length ? ` (${flags.join(', ')})` : ''}`
        })
        .join('\n'),
      'TILES REBUILD DRY RUN',
    )
    outro(
      `Would rebuild ${sourceBackedReleases.length} PMTiles releases; retain ${releases.filter(release => release.imported).length} imported releases; ${unavailableReleases.length} source-backed releases need archived inputs`,
    )
    return
  }

  if (!input.rewriteHistory) {
    throw new Error('tiles:rebuild requires --rewrite-history outside a dry run.')
  }

  if (unavailableReleases.length > 0) {
    throw new Error(
      [
        'Historical source archives are missing; nothing has been published:',
        ...unavailableReleases.map(
          release =>
            `${release.region.code} ${release.version}: ${release.sourceError ?? 'unknown source error'}`,
        ),
      ].join('\n'),
    )
  }

  // Validate the entire source-backed release set before replacing any immutable
  // object. This prevents a partially rewritten history if an archive is absent.
  const historicalSources = new Map(
    sourceBackedReleases.flatMap(release =>
      release.source
        ? [[releaseKey(release.region, release.version), release.source] as const]
        : [],
    ),
  )

  for (const release of sourceBackedReleases) {
    const historicalSource = historicalSources.get(
      releaseKey(release.region, release.version),
    )
    if (!historicalSource) {
      throw new Error(
        `Missing preflight source for ${release.region.code} ${release.version}.`,
      )
    }
    await runTilesCommand({
      region: release.region,
      version: release.version,
      operation: 'rebuild',
      dryRun: false,
      force: true,
      file: undefined,
      boundaryFile: undefined,
      promoteLatest: release.promoteLatest,
      historicalSource: historicalSource.primary,
      historicalBorderSource: historicalSource.border,
    })
    await renderBasemapPreviews({
      region: release.region,
      version: release.version,
      modes: ['light', 'dark'],
      dryRun: false,
    })
    await renderStyleLibraryPreviews(release.region, release.version, false)
  }

  outro(
    `Rebuilt ${sourceBackedReleases.length} PMTiles releases; retained ${releases.filter(release => release.imported).length} imported releases`,
  )
}

/** Rebuild one date across all regions from its archived GeoFabrik inputs. */
async function runTilesDateRebuild(input: ReturnType<typeof resolveTilesRebuildInput>) {
  const version = input.version
  if (!version) throw new Error('A date-specific rebuild requires --date YYYY-MM-DD.')
  const regionCodes = input.region ? [input.region] : REGION_PROCESSING_ORDER
  const releases = await Promise.all(
    regionCodes.map(async code => {
      const region = { code, ...REGIONS[code] }
      const versions = await readRegionVersions(region)
      return {
        region,
        version,
        published: versions.versions.some(entry => entry.version === version),
        imported: await isImportedRelease(region, version),
      }
    }),
  )
  const missingReleases = releases.filter(release => !release.published)
  if (missingReleases.length > 0) {
    throw new Error(
      [
        'Cannot rebuild unpublished PMTiles releases:',
        ...missingReleases.map(release => `${release.region.code} ${release.version}`),
      ].join('\n'),
    )
  }
  const sourceBackedReleases = releases.filter(release => !release.imported)
  if (sourceBackedReleases.length === 0)
    throw new Error('No source-backed PMTiles releases to rebuild.')
  const historicalSources = new Map<string, HistoricalSources>()
  const missingSources: string[] = []
  for (const release of sourceBackedReleases) {
    const source = await findHistoricalSource(release.region, release.version)
    if (source.path) {
      historicalSources.set(releaseKey(release.region, release.version), source.path)
    } else {
      missingSources.push(
        `${release.region.code} ${release.version}: ${source.error ?? 'unknown source error'}`,
      )
    }
  }

  if (input.dryRun) {
    note(
      releases
        .map(release => {
          const flags = [
            release.imported ? 'imported; retained' : undefined,
            input.promoteLatest && !release.imported ? 'promote latest' : undefined,
          ].filter(Boolean)
          return `${release.region.code}: ${release.region.name}-${release.version}${flags.length ? ` (${flags.join(', ')})` : ''}`
        })
        .join('\n'),
      'TILES DATE REBUILD DRY RUN',
    )
    if (missingSources.length > 0) {
      throw new Error(
        ['Historical source archives are missing:', ...missingSources].join('\n'),
      )
    }
    outro(
      `Would rebuild ${sourceBackedReleases.length} PMTiles releases; retain ${releases.length - sourceBackedReleases.length} imported releases`,
    )
    return
  }

  if (!input.rewriteHistory) {
    throw new Error('A date-specific tiles:rebuild requires --rewrite-history.')
  }
  if (missingSources.length > 0) {
    throw new Error(
      [
        'Historical source archives are missing; nothing has been published:',
        ...missingSources,
      ].join('\n'),
    )
  }

  for (const release of sourceBackedReleases) {
    const historicalSource = historicalSources.get(
      releaseKey(release.region, release.version),
    )
    if (!historicalSource) {
      throw new Error(
        `Missing preflight source for ${release.region.code} ${release.version}.`,
      )
    }
    await runTilesCommand({
      region: release.region,
      version: release.version,
      operation: 'rebuild',
      dryRun: false,
      force: true,
      file: undefined,
      boundaryFile: undefined,
      promoteLatest: input.promoteLatest,
      historicalSource: historicalSource.primary,
      historicalBorderSource: historicalSource.border,
    })
    await renderBasemapPreviews({
      region: release.region,
      version: release.version,
      modes: ['light', 'dark'],
      dryRun: false,
    })
    await renderStyleLibraryPreviews(release.region, release.version, false)
  }

  outro(
    `Rebuilt ${sourceBackedReleases.length} PMTiles releases for ${version}; retained ${releases.length - sourceBackedReleases.length} imported releases`,
  )
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
    objectKey(input.region.code, `${releaseName}-light.webp`),
    objectKey(input.region.code, `${releaseName}-dark.webp`),
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
    await deleteObject(
      objectKey(input.region.code, `${input.region.name}-latest-light.webp`),
    )
    await deleteObject(
      objectKey(input.region.code, `${input.region.name}-latest-dark.webp`),
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

async function runTilesCommand(
  input: ReturnType<typeof resolveTilesInput> & {
    promoteLatest?: boolean
    historicalSource?: string
    historicalBorderSource?: string
  },
) {
  const shouldPromoteLatest =
    input.operation === 'refresh' ||
    (input.operation === 'rebuild' && input.promoteLatest)
  const outputName = `${input.region.name}-${input.version}.pmtiles`
  const outputPath = resolve(OUTPUT_ROOT, input.region.code, outputName)

  if (input.dryRun) {
    note(
      [
        `region: ${input.region.code} (${input.region.name})`,
        `version: ${input.version}`,
        `source: ${input.file ?? `Planetiler --area=${input.region.area}`}`,
        `archive: ${objectKey(input.region.code, outputName)}`,
        ...(shouldPromoteLatest
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

  const prepared =
    input.operation === 'import'
      ? undefined
      : await prepareRegionInputs(
          input.region,
          input.version,
          input.historicalSource,
          input.historicalBorderSource,
        )
  const clip =
    prepared?.clip ??
    (await prepareImportedRegionClip(input.region, input.boundaryFile))
  const coastline = prepared
    ? await buildRegionalCoastline(input.region, input.version, clip, prepared.source)
    : undefined
  let build:
    | Awaited<ReturnType<typeof buildTileset>>
    | {
        archivePath: string
        provenance: { type: 'import' }
      }
  if (input.file) {
    build = { archivePath: input.file, provenance: { type: 'import' } }
  } else {
    if (!prepared || !coastline) {
      throw new Error('A generated tileset requires source-backed regional inputs.')
    }
    build = await buildTileset(
      input.region,
      outputPath,
      input.force,
      prepared,
      coastline,
    )
  }
  const archivePath = build.archivePath
  const archive = await archiveMetadata(archivePath)
  const boundaryName = `${input.region.name}-${input.version}.boundary.geojson`
  const boundaryPath = resolve(OUTPUT_ROOT, input.region.code, boundaryName)
  await writeJson(boundaryPath, clip.geojson)
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
      schema: {
        version: BASEMAP_SCHEMA_VERSION,
        base: 'Protomaps Basemaps v2',
      },
      archive: entry,
      boundary: {
        key: objectKey(input.region.code, boundaryName),
        ...(shouldPromoteLatest ? { latestKey: latestBoundaryKey } : {}),
        sha256: boundary.sha256,
        size: boundary.size,
        boundaryRelations: clip.boundaryRelations,
        clipBuffer: clip.buffer,
        source: clip.source,
      },
      ...(coastline
        ? {
            coastline: {
              source: prepared?.source.upstream,
              land: coastline.land.metadata,
              water: coastline.water.metadata,
              line: coastline.line.metadata,
              ...(coastline.border ? { border: coastline.border.metadata } : {}),
              mode: 'source-local OSM earth, water, and coastline layers',
            },
          }
        : {}),
      ...(shouldPromoteLatest ? { latestKey } : {}),
    },
    provenance: build.provenance,
    command: process.argv.slice(2),
  }
  const manifestPath = resolve(OUTPUT_ROOT, input.region.code, manifestName)
  await writeJson(manifestPath, manifest)

  // Releases are immutable by default. --force deliberately rebuilds and replaces
  // the date-versioned archive and manifest before promoting it to latest; a
  // import never changes the current tileset.
  await putObject(archiveKey, archivePath, 'application/octet-stream')
  await putObject(
    objectKey(input.region.code, boundaryName),
    boundaryPath,
    'application/geo+json',
  )
  await putObject(manifestKey, manifestPath, 'application/json')
  if (shouldPromoteLatest) {
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
    ...(shouldPromoteLatest
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
      : input.operation === 'rebuild'
        ? `Rebuilt ${input.region.name}-${input.version}`
        : `Imported ${input.region.name}-${input.version}`,
  )
}

async function runGbaRefresh(input: ReturnType<typeof resolveTilesInput>) {
  const regions = regionsInProcessingOrder()

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
  const rawBoundary =
    typeof args.options.boundary === 'string' ? args.options.boundary : undefined
  const version = operation === 'import' ? rawDate : today()
  const allowedOptions =
    operation === 'import'
      ? ['region', 'date', 'file', 'boundary', 'dry-run']
      : ['region', 'dry-run', 'force']
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !allowedOptions.includes(key))

  if (
    !regionDefinition ||
    !version ||
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    (operation === 'import' && !rawFile) ||
    (operation === 'import' && !rawBoundary) ||
    invalid
  ) {
    printUsage()
    throw new Error(
      operation === 'import'
        ? 'tiles:import requires --region, --date YYYY-MM-DD, --file PATH, and --boundary PATH.'
        : 'tiles:refresh accepts only --region gba|hk|mo, --dry-run, and --force.',
    )
  }

  let file: string | undefined
  let boundaryFile: string | undefined
  if (operation === 'import') {
    if (!rawFile) throw new Error('tiles:import requires --file PATH.')
    file = resolve(process.env.SAANSEOI_INVOCATION_CWD ?? REPO_ROOT, rawFile)
    if (!rawBoundary) throw new Error('tiles:import requires --boundary PATH.')
    boundaryFile = resolve(
      process.env.SAANSEOI_INVOCATION_CWD ?? REPO_ROOT,
      rawBoundary,
    )
  }
  if (file && !existsSync(file)) throw new Error(`Tileset file not found: ${file}`)
  if (boundaryFile && !existsSync(boundaryFile))
    throw new Error(`Boundary file not found: ${boundaryFile}`)

  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version,
    file,
    boundaryFile,
    operation,
    dryRun: Boolean(args.options['dry-run']),
    force: operation === 'refresh' && Boolean(args.options.force),
  }
}

/** Resolve either an all-history rewrite or an explicit all-region date rebuild. */
function resolveTilesRebuildInput(args: ParsedArgs, printUsage: () => void) {
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const region = rawRegion
    ? REGIONS[rawRegion as RegionCode]
      ? (rawRegion as RegionCode)
      : undefined
    : undefined
  const dateRebuild = rawDate !== undefined
  const invalid =
    args.positionals.length > 0 ||
    (!dateRebuild && args.options.all !== true) ||
    (dateRebuild && args.options.all !== true && !region) ||
    (dateRebuild && args.options.all === true && region !== undefined) ||
    (rawRegion !== undefined && !region) ||
    Object.keys(args.options).some(
      key =>
        ![
          'all',
          'date',
          'dry-run',
          'promote-latest',
          'region',
          'rewrite-history',
        ].includes(key),
    )
  if (
    invalid ||
    (dateRebuild && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) ||
    (!dateRebuild && args.options['promote-latest'] === true)
  ) {
    printUsage()
    throw new Error(
      'tiles:rebuild requires --all, or --region gba|hk|mo with --date YYYY-MM-DD; use --promote-latest only for a single-date promotion.',
    )
  }
  return {
    region,
    version: rawDate,
    dryRun: Boolean(args.options['dry-run']),
    promoteLatest: Boolean(args.options['promote-latest']),
    rewriteHistory: Boolean(args.options['rewrite-history']),
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
  const mode =
    rawMode === 'light' ||
    rawMode === 'dark' ||
    rawMode === 'postcard' ||
    rawMode === 'postcard-lit'
      ? rawMode
      : undefined
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
      'tiles:render requires --region gba|hk|mo and --date YYYY-MM-DD; --mode accepts light, dark, postcard, or postcard-lit.',
    )
  }
  const modes: PreviewMode[] = mode
    ? [mode]
    : ['light', 'dark', 'postcard', 'postcard-lit']
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
        ...input.modes.map(
          mode =>
            `viewer (${mode}): ${basemapRenderUrl(input.region, input.version, mode)}`,
        ),
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
        url: basemapRenderUrl(input.region, input.version, mode),
        viewport: { width: 1200, height: 800, deviceScaleFactor: 1 },
        gotoOptions: {
          waitUntil:
            mode === 'postcard' || mode === 'postcard-lit'
              ? 'domcontentloaded'
              : 'networkidle2',
          timeout: 60_000,
        },
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
  await purgeTilesHostCache()
  outro(`Rendered ${input.region.name}-${input.version} basemap previews`)
}

function basemapRenderUrl(region: Region, version: string, mode: PreviewMode) {
  const url = new URL(VIEWER_ORIGIN)
  url.searchParams.set('headless', 'true')
  url.searchParams.set('region', region.code)
  url.searchParams.set('version', version)
  // Light and dark marketing modes deliberately share the midnight map style for now.
  url.searchParams.set('theme', 'midnight')
  if (mode === 'postcard' || mode === 'postcard-lit')
    url.searchParams.set('render', mode)
  // Browser Rendering retains its navigation cache between captures. Ensure a
  // refreshed artefact always evaluates the newly deployed postcard camera.
  url.searchParams.set('capture', `${mode}-${Date.now()}`)
  url.searchParams.set('locale', 'en')
  return url.toString()
}

async function renderStyleLibraryPreviews(
  region: Region,
  version: string,
  dryRun: boolean,
) {
  const previews = mapStyleIds.flatMap(style =>
    ([16, 19] as const).map(zoom => ({ style, zoom })),
  )
  if (dryRun) {
    note(
      previews
        .map(({ style, zoom }) => {
          const camera = STYLE_PREVIEW_CAMERAS[region.code][zoom]
          const name = stylePreviewName(region, version, style, camera.landmark, zoom)
          return `${style} z${zoom}: ${basemapStylePreviewUrl(region, version, style, camera, zoom)}\npreview: ${objectKey(region.code, name)}`
        })
        .join('\n'),
      'STYLE LIBRARY PREVIEW DRY RUN',
    )
    return
  }

  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'Style preview rendering requires CLOUDFLARE_API_TOKEN with Browser Rendering - Edit and Workers R2 Storage - Edit permissions.',
    )
  }
  await mkdir(resolve(TILES_ROOT, 'renders'), { recursive: true })
  const latestVersion = (await readVersionsIndex()).regions[region.code]?.latest
    ?.version
  for (const { style, zoom } of previews) {
    const camera = STYLE_PREVIEW_CAMERAS[region.code][zoom]
    const name = stylePreviewName(region, version, style, camera.landmark, zoom)
    const response = await fetch(BROWSER_RENDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: basemapStylePreviewUrl(region, version, style, camera, zoom),
        viewport: { width: 512, height: 512, deviceScaleFactor: 1 },
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
    await putObject(objectKey(region.code, name), path, 'image/webp')
    if (latestVersion === version) {
      await putObject(
        objectKey(
          region.code,
          stylePreviewName(region, 'latest', style, camera.landmark, zoom),
        ),
        path,
        'image/webp',
      )
    }
  }
}

function stylePreviewName(
  region: Region,
  version: string,
  style: MapStyleId,
  landmark: string,
  zoom: 16 | 19,
) {
  return `${region.name}-${version}-${style}-${landmark}-z${zoom}.webp`
}

function basemapStylePreviewUrl(
  region: Region,
  version: string,
  style: MapStyleId,
  camera: StylePreviewCamera,
  zoom: 16 | 19,
) {
  const url = new URL(VIEWER_ORIGIN)
  url.searchParams.set('headless', 'true')
  url.searchParams.set('region', region.code)
  url.searchParams.set('version', version)
  url.searchParams.set('theme', style)
  url.searchParams.set('lng', String(camera.lng))
  url.searchParams.set('lat', String(camera.lat))
  url.searchParams.set('z', String(zoom))
  url.searchParams.set('bearing', '0')
  url.searchParams.set('pitch', '0')
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
  const regionalPatchHash = createHash('sha256')
    .update(await readFile(REGIONAL_COASTLINE_PATCH))
    .digest('hex')
    .slice(0, 12)
  const image = `protomaps/basemaps:${basemaps.commit.slice(0, 12)}-regional-coastline-${regionalPatchHash}`
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
    `--area=${prepared.source.planetilerArea}`,
    `--clip=/tiles/data/sources/${prepared.clip.fileName}`,
    '--clip-buffer=0',
    `--regional-land=/tiles/data/${basename(coastline.land.path)}`,
    `--regional-water=/tiles/data/${basename(coastline.water.path)}`,
    `--regional-coastline=/tiles/data/${basename(coastline.line.path)}`,
    ...(coastline.border
      ? [`--regional-border=/tiles/data/${basename(coastline.border.path)}`]
      : []),
    ...(force ? ['--force'] : []),
  ])

  return {
    archivePath: outputPath,
    provenance: {
      type: 'planetiler',
      basemaps: { repository: BASEMAPS_REPOSITORY, commit: basemaps.commit },
      saanSeoi: { repository: SAANSEOI_REPOSITORY, commit: saanSeoiCommit.trim() },
      dockerImage: image,
      regionalCoastline:
        'source-local earth, water, coastline, and optional land-border layers',
      command: [
        '--download',
        `--output=data/${basename(outputPath)}`,
        `--area=${prepared.source.planetilerArea}`,
        `--clip=/tiles/data/sources/${prepared.clip.fileName}`,
        '--clip-buffer=0',
        `--regional-land=/tiles/data/${basename(coastline.land.path)}`,
        `--regional-water=/tiles/data/${basename(coastline.water.path)}`,
        `--regional-coastline=/tiles/data/${basename(coastline.line.path)}`,
        ...(coastline.border
          ? [`--regional-border=/tiles/data/${basename(coastline.border.path)}`]
          : []),
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

async function prepareRegionInputs(
  region: Region,
  version: string,
  historicalSource?: string,
  historicalBorderSource?: string,
) {
  const parent = historicalSource
    ? await prepareHistoricalOsmSource(region, historicalSource)
    : await prepareGuangdongSource(version)
  const borderParent = historicalBorderSource
    ? await prepareHistoricalOsmSource(
        { code: 'gba', ...REGIONS.gba },
        historicalBorderSource,
      )
    : parent
  note(`Resolving the ${region.description} boundary from the source PBF.`, 'TILE CLIP')
  let clip: Awaited<ReturnType<typeof prepareRegionClip>>
  try {
    clip = await prepareRegionClip(
      region,
      await getRegionBoundaries(region, borderParent.path),
    )
  } catch (error) {
    if (region.code !== 'gba' || !historicalSource) throw error
    note(
      'The archived source cannot resolve the GBA relations; reusing the release boundary after integrity verification.',
      'TILE CLIP',
    )
    clip = await preparePublishedRegionClip(region, version)
  }
  const source = await extractRegionalOsmSource(region, version, parent, clip.geojson)
  const borderSourcePath = region.code === 'mo' ? borderParent.path : source.path
  return { clip, source: { ...source, borderSourcePath } }
}

/**
 * Build coastline-accurate earth, water, and shoreline layers for the exact release area.
 *
 * Coastline ways are clipped to the regional footprint and combined with the footprint
 * boundary to polygonise local faces. OSM coastline direction identifies land as the
 * face on the line's left. The footprint edges close fills only and are never emitted
 * in the public coastline line layer.
 */
async function buildRegionalCoastline(
  region: Region,
  version: string,
  clip: Awaited<ReturnType<typeof prepareRegionClip>>,
  source: PreparedSource,
) {
  const landName = `${region.name}-${version}.coastline-land.geojson`
  const waterName = `${region.name}-${version}.coastline-water.geojson`
  const lineName = `${region.name}-${version}.coastline.geojson`
  const borderName = `${region.name}-${version}.regional-border.geojson`
  const landPath = resolve(OUTPUT_ROOT, region.code, landName)
  const waterPath = resolve(OUTPUT_ROOT, region.code, waterName)
  const linePath = resolve(OUTPUT_ROOT, region.code, lineName)
  const borderPath = resolve(OUTPUT_ROOT, region.code, borderName)
  note(`Building source-local coastline layers for ${region.description}.`, 'COASTLINE')
  const coastlinePath = resolve(
    OUTPUT_ROOT,
    region.code,
    `${region.name}-${version}.osm-coastline.geojson`,
  )
  const coastlinePbfPath = resolve(SOURCES_ROOT, `${region.code}.osm-coastline.pbf`)
  await run([
    'osmium',
    'tags-filter',
    source.path,
    'w/natural=coastline',
    '--output',
    coastlinePbfPath,
    '--overwrite',
  ])
  await run([
    'osmium',
    'export',
    coastlinePbfPath,
    '--geometry-types=linestring',
    '--output',
    coastlinePath,
    '--overwrite',
  ])
  const coastline = await readCoastlineFeatures(coastlinePath, clip.geojson)
  const border = await buildRegionalLandBorder(
    region,
    source.borderSourcePath ?? source.path,
    clip.geojson,
  )
  await writeJson(linePath, coastline.lines)
  await writeJson(landPath, coastline.land)
  await writeJson(waterPath, coastline.water)
  if (border) await writeJson(borderPath, border)
  return {
    land: { path: landPath, metadata: await archiveMetadata(landPath) },
    water: { path: waterPath, metadata: await archiveMetadata(waterPath) },
    line: { path: linePath, metadata: await archiveMetadata(linePath) },
    ...(border
      ? { border: { path: borderPath, metadata: await archiveMetadata(borderPath) } }
      : {}),
  }
}

/**
 * Polygonise the source coastline with the regional footprint only as temporary
 * closing geometry, then return public source-only shoreline lines and complementary
 * land/water fills.
 *
 * @param coastlinePath GeoJSON exported from the exact OSM PBF used for tiles.
 * @param clipGeojson Regional administrative footprint.
 * @returns GeoJSON ready for Planetiler's regional base layers.
 */
async function readCoastlineFeatures(
  coastlinePath: string,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const source = JSON.parse(await readFile(coastlinePath, 'utf8')) as {
    type?: string
    features?: Array<{ geometry?: unknown }>
  }
  if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('OSM coastline export did not produce a GeoJSON FeatureCollection.')
  }

  return polygoniseCoastlineFeatures(source.features, clipGeojson)
}

/**
 * Build non-overlapping land and water faces from source coastline linework.
 *
 * Exported to keep the nested-island coverage invariant directly testable.
 */
export function polygoniseCoastlineFeatures(
  sourceFeatures: Array<{ geometry?: unknown }>,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const clip = reader.read(JSON.stringify(clipGeojson.geometry)) as CoastlineGeometry
  const coastlineLines: CoastlineGeometry[] = []

  for (const feature of sourceFeatures) {
    if (!feature.geometry) continue
    const geometry = reader.read(JSON.stringify(feature.geometry)) as CoastlineGeometry
    if (geometry.isEmpty()) continue
    // Preserve only source coastline inside the release footprint for publication.
    coastlineLines.push(
      ...lineComponents(OverlayOp.intersection(geometry, clip) as CoastlineGeometry),
    )
  }

  if (coastlineLines.length === 0) {
    throw new Error('No OSM coastline intersects the regional footprint.')
  }

  // Noding the temporary footprint boundary with source lines gives Polygonizer closed faces.
  const constructionLines = new ArrayList([])
  for (const line of [...coastlineLines, ...lineComponents(clip.getBoundary())]) {
    constructionLines.add(line)
  }
  // Unary union both nodes crossings and preserves the footprint's outer face.
  // GeometryNoder can leave that large face invalid for detailed, multi-island
  // administrative boundaries, which incorrectly turns the residual mainland into water.
  const nodedLinework = new ArrayList([])
  for (const line of lineComponents(UnaryUnionOp.union(constructionLines))) {
    nodedLinework.add(line)
  }
  const polygonizer = new Polygonizer()
  polygonizer.add(nodedLinework)
  const faces = polygonizer.getPolygons().toArray() as CoastlineGeometry[]
  if (faces.length === 0) {
    throw new Error('OSM coastline could not polygonise any regional faces.')
  }

  // OSM's coastline direction places land on its left, so that side selects land faces.
  // Polygonizer represents an enclosing water area and its island faces as nested
  // polygons rather than a disjoint partition. Choose the smallest face containing
  // the left-side point to identify the local face instead of marking every enclosing
  // polygon as land.
  const pointLocator = new PointLocator()
  const facesByEnvelope = new STRtree()
  for (const face of faces) {
    facesByEnvelope.insert(face.getEnvelopeInternal(), face)
  }
  const landFaces = new Set<CoastlineGeometry>()
  for (const line of coastlineLines) {
    const face = leftSideFace(line, facesByEnvelope, pointLocator)
    if (face) landFaces.add(face)
  }
  if (landFaces.size === 0) {
    throw new Error(
      'OSM coastline did not produce complementary regional land and water.',
    )
  }

  // Polygonizer produces nested faces rather than a partition: the outer water
  // face still geometrically contains every island face. Publishing that face
  // directly would render ocean over the islands because the water layer sits
  // above earth. Derive water from the exact footprint minus all land faces so
  // its interior rings preserve every island.
  const land = unionBalanced([...landFaces]) as CoastlineGeometry
  const water = OverlayOp.difference(clip, land) as CoastlineGeometry
  const waterFaces = polygonComponents(water)
  if (waterFaces.length === 0) {
    throw new Error(
      'OSM coastline did not produce complementary regional land and water.',
    )
  }

  return {
    lines: geojsonFeatureCollection(writer, coastlineLines),
    land: geojsonFeatureCollection(writer, [...landFaces]),
    water: geojsonFeatureCollection(writer, waterFaces),
  }
}

/**
 * Extract the source relation members that form the regional footprint's non-maritime boundary.
 *
 * @param region Regional tile release being built.
 * @param sourcePath Complete OSM context used to resolve the boundary relation.
 * @param clipGeojson Dissolved regional footprint used to exclude internal GBA borders.
 * @returns Source-local linework for the intentional landward regional border layer.
 */
async function buildRegionalLandBorder(
  region: Region,
  sourcePath: string,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const relationPbfPath = resolve(
    SOURCES_ROOT,
    `${region.code}.regional-border.osm.pbf`,
  )
  const relationGeojsonPath = resolve(
    SOURCES_ROOT,
    `${region.code}.regional-border.geojson`,
  )
  const extract = await runQuiet([
    'osmium',
    'getid',
    '-r',
    '--output',
    relationPbfPath,
    '--overwrite',
    sourcePath,
    ...REGION_BOUNDARY_RELATIONS[region.code].map(id => `r${id}`),
  ])
  if (extract.exitCode !== 0) {
    note(
      `The date-matched source does not contain the regional boundary relation; omitting the optional regional_border layer.`,
      'REGIONAL BORDER',
    )
    return undefined
  }
  await run([
    'osmium',
    'export',
    relationPbfPath,
    '--geometry-types=linestring',
    '--output',
    relationGeojsonPath,
    '--overwrite',
  ])

  const source = JSON.parse(await readFile(relationGeojsonPath, 'utf8')) as {
    type?: string
    features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>
  }
  if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('OSM boundary export did not produce a GeoJSON FeatureCollection.')
  }

  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const clip = reader.read(JSON.stringify(clipGeojson.geometry)) as CoastlineGeometry
  const landBorderLines: CoastlineGeometry[] = []
  for (const feature of source.features) {
    if (
      !feature.geometry ||
      feature.properties?.boundary !== 'administrative' ||
      feature.properties?.natural === 'coastline' ||
      feature.properties?.maritime === 'yes'
    ) {
      continue
    }
    const geometry = reader.read(JSON.stringify(feature.geometry)) as CoastlineGeometry
    landBorderLines.push(
      ...lineComponents(
        OverlayOp.intersection(geometry, clip.getBoundary()) as CoastlineGeometry,
      ),
    )
  }
  if (landBorderLines.length === 0) return undefined
  return geojsonFeatureCollection(writer, landBorderLines)
}

/** Return each LineString component without exposing construction-only polygon edges. */
function lineComponents(geometry: CoastlineGeometry): CoastlineGeometry[] {
  if (geometry.isEmpty()) return []
  const type = geometry.getGeometryType()
  if (type === 'LineString' || type === 'LinearRing') return [geometry]
  if (type !== 'MultiLineString' && type !== 'GeometryCollection') return []
  const lines: CoastlineGeometry[] = []
  for (let index = 0; index < geometry.getNumGeometries(); index += 1) {
    const component = geometry.getGeometryN(index) as CoastlineGeometry
    lines.push(...lineComponents(component))
  }
  return lines
}

/** Return every Polygon component, including polygons held in a collection. */
function polygonComponents(geometry: CoastlineGeometry): CoastlineGeometry[] {
  if (geometry.isEmpty()) return []
  const type = geometry.getGeometryType()
  if (type === 'Polygon') return [geometry]
  if (type !== 'MultiPolygon' && type !== 'GeometryCollection') return []
  const polygons: CoastlineGeometry[] = []
  for (let index = 0; index < geometry.getNumGeometries(); index += 1) {
    const component = geometry.getGeometryN(index) as CoastlineGeometry
    polygons.push(...polygonComponents(component))
  }
  return polygons
}

/** Return the smallest local face containing a point infinitesimally left of a coastline. */
function leftSideFace(
  line: CoastlineGeometry,
  facesByEnvelope: STRtree,
  pointLocator: PointLocator,
): CoastlineGeometry | undefined {
  const coordinates = line.getCoordinates()
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!previous || !current) continue
    const deltaX = current.x - previous.x
    const deltaY = current.y - previous.y
    const length = Math.hypot(deltaX, deltaY)
    if (length === 0) continue
    const midpointX = (previous.x + current.x) / 2
    const midpointY = (previous.y + current.y) / 2
    const offset = Math.min(length / 10, 0.000001)
    const point = new Coordinate(
      midpointX - (deltaY / length) * offset,
      midpointY + (deltaX / length) * offset,
    )
    const faces = facesByEnvelope
      .query(new Envelope(point))
      .toArray()
      .filter((face: unknown): face is CoastlineGeometry =>
        pointLocator.intersects(point, face as CoastlineGeometry),
      )
      .sort(
        (left: CoastlineGeometry, right: CoastlineGeometry) =>
          left.getArea() - right.getArea(),
      ) as CoastlineGeometry[]
    const face = faces[0]
    if (face) return face
  }
  return undefined
}

/** Serialise geometries as a GeoJSON FeatureCollection for Planetiler's GeoJSON source. */
function geojsonFeatureCollection(
  writer: GeoJSONWriter,
  geometries: CoastlineGeometry[],
) {
  return {
    type: 'FeatureCollection' as const,
    features: geometries
      .filter(geometry => !geometry.isEmpty())
      .map(geometry => ({
        type: 'Feature' as const,
        properties: {},
        geometry: writer.write(geometry),
      })),
  }
}

async function prepareRegionClip(region: Region, boundaries: OsmBoundary[]) {
  return prepareRegionClipGeoJson(
    region,
    boundariesToClipGeoJson(boundaries),
    'source-pbf',
  )
}

async function preparePublishedRegionClip(region: Region, version: string) {
  const key = objectKey(region.code, `${region.name}-${version}.boundary.geojson`)
  const manifest = await getJson<{
    release?: { boundary?: { sha256?: unknown } }
  }>(objectKey(region.code, `${region.name}-${version}.json`))
  const expectedSha = manifest?.release?.boundary?.sha256
  if (typeof expectedSha !== 'string') {
    throw new Error(
      `Historic ${region.description} release has no verifiable boundary hash.`,
    )
  }
  const path = resolve(
    SOURCES_ROOT,
    `${region.code}-${version}.published-boundary.geojson`,
  )
  const found = await getObject(BUCKET, key, path)
  if (!found)
    throw new Error(
      `Published boundary is missing for ${region.description} ${version}.`,
    )
  const metadata = await archiveMetadata(path)
  if (metadata.sha256 !== expectedSha) {
    throw new Error(
      `Published boundary hash does not match its release manifest for ${region.description} ${version}.`,
    )
  }
  const geojson = JSON.parse(await readFile(path, 'utf8')) as ReturnType<
    typeof boundariesToClipGeoJson
  >
  if (geojson.type !== 'Feature' || !geojson.geometry) {
    throw new Error(
      `Published boundary is not a GeoJSON feature for ${region.description} ${version}.`,
    )
  }
  return prepareRegionClipGeoJson(region, geojson, 'published-release-geojson')
}

async function prepareImportedRegionClip(
  region: Region,
  boundaryPath: string | undefined,
) {
  if (!boundaryPath)
    throw new Error('An imported tileset requires a matching boundary file.')
  const geojson = JSON.parse(await readFile(boundaryPath, 'utf8')) as ReturnType<
    typeof boundariesToClipGeoJson
  >
  if (
    geojson.type !== 'Feature' ||
    !geojson.geometry ||
    (geojson.geometry.type !== 'Polygon' && geojson.geometry.type !== 'MultiPolygon')
  ) {
    throw new Error(
      'Imported boundary must be a GeoJSON Polygon or MultiPolygon feature.',
    )
  }
  return prepareRegionClipGeoJson(region, geojson, 'imported-file')
}

async function prepareRegionClipGeoJson(
  region: Region,
  geojson: ReturnType<typeof boundariesToClipGeoJson>,
  source: 'source-pbf' | 'published-release-geojson' | 'imported-file',
) {
  await mkdir(SOURCES_ROOT, { recursive: true })
  const fileName = `${region.code}.clip.geojson`
  const path = resolve(SOURCES_ROOT, fileName)
  await writeFile(path, `${JSON.stringify(geojson)}\n`, 'utf8')
  return {
    fileName,
    boundaryRelations: REGION_BOUNDARY_RELATIONS[region.code],
    buffer: 0,
    geojson,
    source,
  }
}

/**
 * Download and extract one date-named GBA source for a refresh.
 *
 * A refresh must not reuse an unversioned `*-latest` cache: that would allow a
 * newly dated tileset to carry stale OSM and coastline data. Re-running the
 * same release date deliberately reuses its input so all GBA subregions share
 * one exact source snapshot.
 */
async function prepareGuangdongSource(version: string): Promise<PreparedSource> {
  await mkdir(SOURCES_ROOT, { recursive: true })
  const guangdongPath = resolve(SOURCES_ROOT, `guangdong-${version}.osm.pbf`)
  if (!existsSync(guangdongPath)) {
    const restored = await getObject(
      SOURCE_BUCKET,
      sourceArchiveKey(version),
      guangdongPath,
    )
    if (restored) {
      note(
        `Restored the archived GeoFabrik Guangdong source for ${version}.`,
        'OSM SOURCE',
      )
    } else {
      note(
        `Downloading the latest GeoFabrik Guangdong source for ${version}.`,
        'OSM SOURCE',
      )
      await downloadFile(GUANGDONG_EXTRACT_URL, guangdongPath)
    }
  }
  const sourceArchive = await archiveGuangdongSource(guangdongPath, version)

  return {
    path: guangdongPath,
    planetilerArea: `source-guangdong-${version}`,
    upstream: GUANGDONG_EXTRACT_URL,
    boundaryRelations: GBA_BOUNDARY_RELATIONS,
    sourceArchive,
  }
}

/**
 * Resolve Macao's cross-boundary administrative relation against the complete GBA
 * export. The dedicated Macao GeoFabrik extract omits the adjoining Zhuhai ways.
 */
/** Derive each published region from the one archived Guangdong source snapshot. */
async function extractRegionalOsmSource(
  region: Region,
  version: string,
  parent: PreparedSource,
  boundary: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const planetilerArea = `refresh-${region.code}-${version}`
  const path = resolve(SOURCES_ROOT, `${planetilerArea}.osm.pbf`)
  const polygonPath = resolve(SOURCES_ROOT, `${planetilerArea}.poly`)
  await mkdir(SOURCES_ROOT, { recursive: true })
  if (!existsSync(path)) {
    if (!(await commandSucceeds(['osmium', '--version']))) {
      throw new Error(
        'Tile preparation requires osmium on PATH. Install osmium-tool and retry.',
      )
    }
    await writeFile(
      polygonPath,
      boundariesToOsmiumPolygon([{ osm_id: 0, geojson: boundary.geometry }]),
      'utf8',
    )
    note(
      `Extracting ${region.description} from the archived Guangdong source.`,
      'OSM SOURCE',
    )
    await run([
      'osmium',
      'extract',
      '--strategy=complete_ways',
      `--polygon=${polygonPath}`,
      `--output=${path}`,
      '--overwrite',
      parent.path,
    ])
  }
  return {
    path,
    planetilerArea,
    upstream: parent.upstream,
    boundaryRelations: parent.boundaryRelations,
    extractionStrategy: 'osmium complete_ways from archived GeoFabrik Guangdong',
    sourceArchive: parent.sourceArchive,
  } satisfies PreparedSource
}

/**
 * Stage one archived GeoFabrik PBF under the Planetiler source directory.
 *
 * Rebuilds use a date-specific name so historical data can never overwrite a
 * current refresh input, while Planetiler still receives its usual --area value.
 */
async function prepareHistoricalOsmSource(
  region: Region,
  archivePath: string,
): Promise<PreparedSource> {
  const version = archivePath.split('/').at(-2)
  if (!version) throw new Error(`Invalid historical source path: ${archivePath}`)
  const planetilerArea = `historical-${region.code}-${version}`
  const path = resolve(SOURCES_ROOT, `${planetilerArea}.osm.pbf`)
  await mkdir(SOURCES_ROOT, { recursive: true })
  await copyFile(archivePath, path)
  const sourceArchive = basename(archivePath).startsWith('guangdong')
    ? await archiveGuangdongSource(path, version)
    : undefined
  return {
    path,
    planetilerArea,
    upstream: `local GeoFabrik archive ${basename(archivePath)}`,
    sourceArchive,
  }
}

/** Locate the one archived PBF required to faithfully rebuild a regional release. */
async function historicalSourcePath(region: Region, version: string): Promise<string> {
  const directory = resolve(HISTORICAL_SOURCES_ROOT, version)
  const archivedGuangdong = resolve(directory, 'guangdong.osm.pbf')
  if (await getObject(SOURCE_BUCKET, sourceArchiveKey(version), archivedGuangdong)) {
    return archivedGuangdong
  }
  if (!existsSync(directory)) {
    throw new Error(
      `Historical source directory missing for ${region.code} ${version}: ${directory}`,
    )
  }
  const guangdongCandidates = (await readdir(directory))
    .filter(name => name.startsWith('guangdong-') && name.endsWith('.osm.pbf'))
    .sort()
  if (guangdongCandidates.length === 1) {
    const candidate = guangdongCandidates[0]
    if (!candidate)
      throw new Error(`Historical Guangdong source missing for ${version}.`)
    return resolve(directory, candidate)
  }
  if (guangdongCandidates.length > 1) {
    throw new Error(
      `Expected exactly one historical GeoFabrik Guangdong PBF for ${version} in ${directory}; found ${guangdongCandidates.length}.`,
    )
  }
  if (region.code === 'gba') {
    const path = resolve(directory, 'gba.osm.pbf')
    if (!existsSync(path)) {
      throw new Error(`Historical GBA source missing for ${version}: ${path}`)
    }
    return path
  }

  const prefix = region.code === 'hk' ? 'hong-kong-' : 'macau-'
  const candidates = (await readdir(directory))
    .filter(name => name.startsWith(prefix) && name.endsWith('.osm.pbf'))
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one historical ${region.description} GeoFabrik PBF for ${version} in ${directory}; found ${candidates.length}.`,
    )
  }
  const candidate = candidates[0]
  if (!candidate)
    throw new Error(`Historical source missing for ${region.code} ${version}.`)
  return resolve(directory, candidate)
}

/** Imported archives have no reproducible regional source, so history rewrites retain them. */
async function isImportedRelease(region: Region, version: string): Promise<boolean> {
  const manifest = await getJson<{ provenance?: { type?: unknown } }>(
    objectKey(region.code, `${region.name}-${version}.json`),
  )
  const type = manifest?.provenance?.type
  return type === 'import' || LEGACY_IMPORTED_RELEASES.has(releaseKey(region, version))
}

/** Report absence separately so a dry run can show all releases without publishing. */
async function findHistoricalSource(region: Region, version: string) {
  try {
    const primary = await historicalSourcePath(region, version)
    const border = historicalBorderSourceRequired(region.code, primary)
      ? await historicalSourcePath({ code: 'gba', ...REGIONS.gba }, version)
      : undefined
    return { path: { primary, border } }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** A Guangdong export already contains Macao's adjoining Zhuhai relation members. */
export function isGuangdongSource(path: string) {
  return basename(path).startsWith('guangdong')
}

/** Macao needs GBA relation context unless its primary source is already Guangdong. */
export function historicalBorderSourceRequired(
  region: RegionCode,
  primarySource: string,
) {
  return region === 'mo' && !isGuangdongSource(primarySource)
}

function releaseKey(region: Region, version: string): string {
  return `${region.code}:${version}`
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

/** Assemble the requested administrative relations from the exact source PBF. */
async function getRegionBoundaries(
  region: Region,
  sourcePath: string,
): Promise<OsmBoundary[]> {
  if (!(await commandSucceeds(['osmium', '--version']))) {
    throw new Error(
      'Boundary preparation requires osmium on PATH. Install osmium-tool and retry.',
    )
  }
  const relationIds = REGION_BOUNDARY_RELATIONS[region.code]
  const relationsPath = resolve(
    SOURCES_ROOT,
    `${region.code}.boundary-relations.osm.pbf`,
  )
  const geojsonPath = resolve(SOURCES_ROOT, `${region.code}.boundary-relations.geojson`)
  const extracted = await runQuiet([
    'osmium',
    'getid',
    '-r',
    '--output',
    relationsPath,
    '--overwrite',
    sourcePath,
    ...relationIds.map(id => `r${id}`),
  ])
  if (extracted.exitCode !== 0) {
    throw new Error(
      `Could not extract ${region.description} boundary relations from the source PBF.`,
    )
  }
  await run([
    'osmium',
    'export',
    relationsPath,
    '--geometry-types=polygon',
    '--add-unique-id=type_id',
    '--output',
    geojsonPath,
    '--overwrite',
  ])
  const exported = JSON.parse(await readFile(geojsonPath, 'utf8')) as {
    type?: string
    features?: Array<{
      id?: unknown
      geometry?: unknown
      properties?: Record<string, unknown>
    }>
  }
  if (exported.type !== 'FeatureCollection' || !Array.isArray(exported.features)) {
    throw new Error('OSM boundary export did not produce a GeoJSON FeatureCollection.')
  }
  const boundaries = relationIds.flatMap(id => {
    const feature = exported.features?.find(
      candidate => candidate.id === `a${id * 2 + 1}`,
    )
    if (!feature?.geometry || feature.properties?.boundary !== 'administrative')
      return []
    const geometry = feature.geometry as BoundaryGeometry
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return []
    return [{ osm_id: id, geojson: geometry }]
  })
  const found = new Set(boundaries.map(boundary => boundary.osm_id))
  const missing = relationIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw new Error(
      `Could not resolve ${region.description} boundary relations from the source PBF: ${missing.join(', ')}`,
    )
  }

  return relationIds.map(id => {
    const boundary = boundaries.find(candidate => candidate.osm_id === id)
    if (!boundary) throw new Error(`Missing boundary relation ${id}.`)
    return boundary
  })
}

export function boundariesToOsmiumPolygon(boundaries: OsmBoundary[]) {
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

export function boundariesToClipGeoJson(boundaries: OsmBoundary[]) {
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
  const geometry = writer.write(unioned) as BoundaryGeometry
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
    await run(['git', '-C', path, 'checkout', '--detach', '--force', 'FETCH_HEAD'])
    await run(['git', '-C', path, 'clean', '--force', '-d'])
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

function sourceArchiveKey(version: string) {
  return `osm/geofabrik/guangdong/${version}.osm.pbf`
}

async function archiveGuangdongSource(
  path: string,
  version: string,
): Promise<NonNullable<PreparedSource['sourceArchive']>> {
  const metadata = await archiveMetadata(path)
  await putSourceObject(sourceArchiveKey(version), path)
  return {
    bucket: SOURCE_BUCKET,
    key: sourceArchiveKey(version),
    ...metadata,
    sourceUrl: GUANGDONG_EXTRACT_URL,
  }
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
  if (!(await getObject(BUCKET, key, path))) return undefined
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function getObject(bucket: string, key: string, path: string): Promise<boolean> {
  await mkdir(resolve(path, '..'), { recursive: true })
  const result = await runQuiet([
    ...wranglerCommand(),
    'r2',
    'object',
    'get',
    `${bucket}/${key}`,
    '--remote',
    '--file',
    path,
  ])
  if (result.exitCode === 0) return true
  if (!result.stderr.trim() && !result.stdout.trim()) return false
  if (/not found|does not exist|no such object/i.test(result.stderr)) return false
  throw commandError(
    [...wranglerCommand(), 'r2', 'object', 'get', `${bucket}/${key}`],
    result.stderr,
    result.stdout,
  )
}

async function putObject(key: string, file: string, contentType: string) {
  return putBucketObject(BUCKET, key, file, contentType)
}

async function putSourceObject(key: string, file: string) {
  return putBucketObject(SOURCE_BUCKET, key, file, 'application/x-protobuf')
}

async function putBucketObject(
  bucket: string,
  key: string,
  file: string,
  contentType: string,
) {
  await run([
    ...wranglerCommand(),
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
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

/** Invalidate CDN and Worker Cache API entries after changing tile artefacts. */
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
