import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { note, outro } from '@clack/prompts'
import { BASEMAP_SCHEMA_VERSION } from '@repo/basemap'
import type { ParsedArgs } from '../cli/options.ts'
import { resolveTilesInput, resolveTilesRenderInput } from './tilesOptions.ts'
import {
  regionsInProcessingOrder,
  type Region,
  type VersionEntry,
} from './tilesTypes.ts'
import { renderBasemapPreviews, renderStyleLibraryPreviews } from './tilesPreviews.ts'
import {
  OUTPUT_ROOT,
  PREFIX,
  REGIONAL_COASTLINE_PATCH,
  REPOSITORIES_ROOT,
} from './tilesConfig.ts'
import {
  archiveMetadata,
  mergeRegion,
  mergeVersion,
  objectKey,
  putObject,
  readRegionVersions,
  readRegionsIndex,
  readVersionsIndex,
  writeJson,
} from './tilesStorage.ts'
import { buildTileset, prepareRegionInputs } from './tilesBuild.ts'
import {
  applyTilesCatalogueIntent,
  completeTilesCatalogueIntent,
  readTilesCatalogueIntent,
  sameTilesVersion,
  writeTilesCatalogueIntent,
} from './tilesCatalogueRecovery.ts'
import { prepareImportedRegionClip } from './tilesSources.ts'
import { buildRegionalCoastline } from './tilesGeometry.ts'
import { capture, commandSucceeds, run } from './tilesExecution.ts'
import { withDeliveryLock } from '../localPipeline/sqlDeliveryFiles.ts'

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

export async function runTilesCommand(
  input: ReturnType<typeof resolveTilesInput> & {
    promoteLatest?: boolean
    historicalSource?: string
    historicalBorderSource?: string
  },
) {
  if (input.dryRun) return runTilesCommandLocked(input)
  return withDeliveryLock(resolve(OUTPUT_ROOT, 'publication-lock'), () =>
    runTilesCommandLocked(input),
  )
}

async function runTilesCommandLocked(input: Parameters<typeof runTilesCommand>[0]) {
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
    const intentPath = catalogueIntentPath(input.region, input.version)
    const intent = await readTilesCatalogueIntent(intentPath)
    if (
      intent &&
      intent.region.code === input.region.code &&
      sameTilesVersion(intent.entry, existing)
    ) {
      await finishTilesCatalogue(intentPath)
      outro(`Completed ${input.region.name}-${input.version} catalogue publication`)
      return
    }
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
  const intentPath = catalogueIntentPath(input.region, input.version)
  const beforeCatalogue = await readVersionsIndex()
  await writeTilesCatalogueIntent(intentPath, {
    region: input.region,
    entry,
    promoteLatest: Boolean(shouldPromoteLatest),
    previousLatest: beforeCatalogue.regions[input.region.code]?.latest ?? null,
  })
  await putObject(
    objectKey(input.region.code, 'versions.json'),
    regionVersionsPath,
    'application/json',
  )

  await finishTilesCatalogue(intentPath)

  outro(
    input.operation === 'refresh'
      ? `Published ${input.region.name}-${input.version} and refreshed ${latestName}`
      : input.operation === 'rebuild'
        ? `Rebuilt ${input.region.name}-${input.version}`
        : `Imported ${input.region.name}-${input.version}`,
  )
}

function catalogueIntentPath(region: Region, version: string) {
  return resolve(
    OUTPUT_ROOT,
    region.code,
    `${region.name}-${version}.catalogue-pending.json`,
  )
}

async function finishTilesCatalogue(intentPath: string) {
  await completeTilesCatalogueIntent(intentPath, async intent => {
    const regional = await readRegionVersions(intent.region)
    if (
      !sameTilesVersion(
        regional.versions.find(entry => entry.version === intent.entry.version),
        intent.entry,
      )
    )
      throw new Error('Basemap regional release changed; refusing catalogue replay.')
    const versionsIndex = applyTilesCatalogueIntent(
      await readVersionsIndex(),
      intent,
      objectKey(intent.region.code, 'versions.json'),
    )
    const regionsIndex = await readRegionsIndex()
    regionsIndex.updatedAt = new Date().toISOString()
    regionsIndex.regions = mergeRegion(regionsIndex.regions, intent.region)
    const regionsPath = resolve(OUTPUT_ROOT, 'regions.json')
    await writeJson(regionsPath, regionsIndex)

    const versionsPath = resolve(OUTPUT_ROOT, 'versions.json')
    await writeJson(versionsPath, versionsIndex)
    await putObject(`${PREFIX}/versions.json`, versionsPath, 'application/json')
    await putObject(`${PREFIX}/regions.json`, regionsPath, 'application/json')
  })
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
      !input.force &&
      !(await readTilesCatalogueIntent(catalogueIntentPath(region, input.version)))
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

export async function updateRepository(name: string, repository: string) {
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

export async function applyBasemapRegionalCoastlinePatch(path: string) {
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

export type { OsmBoundary } from './tilesTypes.ts'

export {
  runTilesRebuildCommand,
  runTilesRetractCommand,
  resolveTilesRetractionArtefacts,
} from './tilesRebuild.ts'

export {
  polygoniseCoastlineFeatures,
  boundariesToOsmiumPolygon,
  boundariesToClipGeoJson,
} from './tilesGeometry.ts'

export { isGuangdongSource, historicalBorderSourceRequired } from './tilesSources.ts'
