import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { note } from '@clack/prompts'
import type { Region } from './tilesTypes.ts'
import { type buildRegionalCoastline, getRegionBoundaries } from './tilesGeometry.ts'
import { applyBasemapRegionalCoastlinePatch, updateRepository } from './tiles.ts'
import {
  BASEMAPS_REPOSITORY,
  OUTPUT_ROOT,
  REGIONAL_COASTLINE_PATCH,
  REGIONS,
  REPO_ROOT,
  SAANSEOI_REPOSITORY,
  SOURCES_ROOT,
} from './tilesConfig.ts'
import { capture, commandSucceeds, dockerUser, run } from './tilesExecution.ts'
import {
  extractRegionalOsmSource,
  prepareGuangdongSource,
  prepareHistoricalOsmSource,
  preparePublishedRegionClip,
  prepareRegionClip,
} from './tilesSources.ts'

export async function buildTileset(
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

export async function prepareRegionInputs(
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
