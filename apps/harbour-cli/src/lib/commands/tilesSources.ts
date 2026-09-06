import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { note } from '@clack/prompts'
import {
  LEGACY_IMPORTED_RELEASES,
  REGION_BOUNDARY_RELATIONS,
  type OsmBoundary,
  type PreparedSource,
  type Region,
  type RegionCode,
} from './tilesTypes.ts'
import { boundariesToClipGeoJson, boundariesToOsmiumPolygon } from './tilesGeometry.ts'
import {
  archiveGuangdongSource,
  archiveMetadata,
  getJson,
  getObject,
  objectKey,
  sourceArchiveKey,
} from './tilesStorage.ts'
import {
  BUCKET,
  GBA_BOUNDARY_RELATIONS,
  GUANGDONG_EXTRACT_URL,
  HISTORICAL_SOURCES_ROOT,
  REGIONS,
  SOURCES_ROOT,
  SOURCE_BUCKET,
} from './tilesConfig.ts'
import { commandSucceeds, run } from './tilesExecution.ts'

export async function prepareRegionClip(region: Region, boundaries: OsmBoundary[]) {
  return prepareRegionClipGeoJson(
    region,
    boundariesToClipGeoJson(boundaries),
    'source-pbf',
  )
}

export async function preparePublishedRegionClip(region: Region, version: string) {
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

export async function prepareImportedRegionClip(
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
export async function prepareGuangdongSource(version: string): Promise<PreparedSource> {
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
export async function extractRegionalOsmSource(
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
export async function prepareHistoricalOsmSource(
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
export async function isImportedRelease(
  region: Region,
  version: string,
): Promise<boolean> {
  const manifest = await getJson<{ provenance?: { type?: unknown } }>(
    objectKey(region.code, `${region.name}-${version}.json`),
  )
  const type = manifest?.provenance?.type
  return type === 'import' || LEGACY_IMPORTED_RELEASES.has(releaseKey(region, version))
}

/** Report absence separately so a dry run can show all releases without publishing. */
export async function findHistoricalSource(region: Region, version: string) {
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

export function releaseKey(region: Region, version: string): string {
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
