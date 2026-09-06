import { resolve } from 'node:path'
import { note, outro } from '@clack/prompts'
import type { ParsedArgs } from '../cli/options.ts'
import { resolveTilesRebuildInput, resolveTilesRetractInput } from './tilesOptions.ts'
import {
  deleteObject,
  objectKey,
  purgeTilesHostCache,
  putObject,
  readRegionVersions,
  readVersionsIndex,
  writeJson,
} from './tilesStorage.ts'
import {
  REGION_PROCESSING_ORDER,
  regionProcessingIndex,
  type HistoricalSources,
  type RegionCode,
  type VersionEntry,
} from './tilesTypes.ts'
import { OUTPUT_ROOT, PREFIX, REGIONS } from './tilesConfig.ts'
import { findHistoricalSource, isImportedRelease, releaseKey } from './tilesSources.ts'
import { runTilesCommand } from './tiles.ts'
import { renderBasemapPreviews, renderStyleLibraryPreviews } from './tilesPreviews.ts'

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
  const artefacts = resolveTilesRetractionArtefacts(input.region, input.version, entry)
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

export function resolveTilesRetractionArtefacts(
  region: { code: RegionCode; name: string },
  version: string,
  entry?: Pick<VersionEntry, 'key' | 'manifestKey'>,
) {
  const releaseName = `${region.name}-${version}`
  const archiveKey = objectKey(region.code, `${releaseName}.pmtiles`)
  const manifestKey = objectKey(region.code, `${releaseName}.json`)

  if (entry?.key && entry.key !== archiveKey) {
    throw new Error(
      `Refusing tiles retraction: catalogue archive key does not match ${archiveKey}.`,
    )
  }
  if (entry?.manifestKey && entry.manifestKey !== manifestKey) {
    throw new Error(
      `Refusing tiles retraction: catalogue manifest key does not match ${manifestKey}.`,
    )
  }

  return [
    archiveKey,
    manifestKey,
    objectKey(region.code, `${releaseName}.boundary.geojson`),
    // Releases published before regional coastlines were embedded expose this
    // legacy, viewer-only artefact too. R2 deletion is idempotent.
    objectKey(region.code, `${releaseName}.land.geojson`),
    objectKey(region.code, `${releaseName}-light.webp`),
    objectKey(region.code, `${releaseName}-dark.webp`),
  ]
}
