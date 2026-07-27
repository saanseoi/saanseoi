import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { unzipSync } from 'fflate'
import { and, eq } from 'drizzle-orm'

import { metaAssets } from '@repo/db'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { withLocalMetaDb } from '../../../harbour-cli/src/lib/addressSql/localDbCache.ts'
import { prepareHkgovCenstatdDistrictStatisticUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'
import {
  mirrorCsdiSourceArchive,
  prepareCsdiSourceArchive,
} from '../../../harbour-cli/src/lib/sources/sourceArchives.ts'

const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const REPO_ROOT = resolve(import.meta.dir, '../../../..')

export async function runHkgovCenstatdDistrictStatisticIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceVersion = args.options['source-version']
  if (
    target.remote ||
    (sourceVersion !== '2022' && sourceVersion !== '2024') ||
    args.positionals.length
  ) {
    printUsage()
    throw new Error(
      'C&SD district statistic ingestion requires --target local --source-version 2022|2024.',
    )
  }
  const release = await resolveRelease(sourceVersion)
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-density-'))
  try {
    const sourceArchiveKey = await ensureLocalSourceArchive(release, workDir)
    const archivePath = join(workDir, 'source.zip')
    await readLocalSourceArchive(sourceArchiveKey, archivePath)
    const archive = unzipSync(new Uint8Array(await readFile(archivePath)))
    const gmlBytes = archive[`Density_${sourceVersion}.gml`]
    if (!gmlBytes)
      throw new Error(`Cached CSDI archive has no Density_${sourceVersion}.gml.`)
    const gmlPath = join(workDir, `Density_${sourceVersion}.gml`)
    const parquetPath = join(
      workDir,
      `hkgov-censtatd-hk-${sourceVersion}-division-statistic.parquet`,
    )
    await writeFile(gmlPath, gmlBytes)
    await prepareHkgovCenstatdDistrictStatisticUpload({
      inputFile: gmlPath,
      outputFile: parquetPath,
      sourceArchiveKey,
      sourceVersion,
    })
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [parquetPath],
        options: {
          'cohort-key': sourceVersion,
          'dataset-code': DATASET_CODE,
          region: 'hk',
          'release-notes-url': release.sourceUrl,
          source: 'hkgov-censtatd',
          'source-version': sourceVersion,
          theme: 'stats',
          type: 'divisionStatistic',
          yes: true,
        },
      },
      target,
      {
        dryRun: false,
        // A previous local process can have staged this deterministic release
        // before the source-statistic importer ran; retry that staged release.
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        skipConfirm: true,
        skipSnapshotCleanup: false,
        validateGeometry: false,
      },
    )
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}

async function resolveRelease(sourceVersion: '2022' | '2024') {
  const fixture = JSON.parse(
    await readFile(
      join(
        REPO_ROOT,
        'fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-land-area-population-density-district.json',
      ),
      'utf8',
    ),
  ) as {
    releases?: Array<{
      sourceVersion?: string
      sourceUrl?: string
      archiveSlots?: Array<{
        contentHash?: string
        releaseSlot?: string
        sourceObjectHash?: string
      }>
    }>
  }
  const slot = fixture.releases?.find(
    release => release.sourceVersion === sourceVersion,
  )?.archiveSlots?.[0]
  const sourceUrl = fixture.releases?.find(
    release => release.sourceVersion === sourceVersion,
  )?.sourceUrl
  if (!slot?.contentHash || !slot.releaseSlot || !slot.sourceObjectHash || !sourceUrl)
    throw new Error(`Fixture lacks the CSDI archive mapping for ${sourceVersion}.`)
  return {
    contentHash: slot.contentHash,
    releaseSlot: slot.releaseSlot,
    sourceObjectHash: slot.sourceObjectHash,
    sourceUrl,
    sourceVersion,
  }
}

type CsdiRelease = {
  contentHash: string
  releaseSlot: string
  sourceObjectHash: string
  sourceUrl: string
  sourceVersion: '2022' | '2024'
}

/**
 * Resolves the registered immutable archive, repairing only an absent local
 * mirror from the fixture-pinned publisher package when local R2 storage was
 * migrated without its source-asset metadata.
 */
async function ensureLocalSourceArchive(release: CsdiRelease, workDir: string) {
  try {
    return await resolveLocalSourceArchiveKey(release.contentHash)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith('No local sourceArchive asset is registered')
    ) {
      throw error
    }
  }

  const sourceUrl = `https://static.csdi.gov.hk/csdi-webpage/download/common/${release.sourceObjectHash}?a=1`
  const publisherDownloadPath = join(workDir, 'publisher-download')
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(
      `Could not re-mirror mapped CSDI archive ${release.releaseSlot}: HTTP ${response.status}.`,
    )
  }
  await writeFile(publisherDownloadPath, new Uint8Array(await response.arrayBuffer()))
  const archive = {
    datasetCode: DATASET_CODE,
    datasetId: 'censtatd_rcd_1635934215448_25451',
    releaseSlot: release.releaseSlot,
    sourceLayers: [`Density_${release.sourceVersion}`],
    sourceUrl,
  }
  const prepared = await prepareCsdiSourceArchive({
    archive,
    inputPath: publisherDownloadPath,
    outputPath: join(workDir, 'mirrored-source.zip'),
  })
  if (prepared.manifest.archive.sha256 !== release.contentHash) {
    throw new Error(
      `Mapped CSDI archive ${release.releaseSlot} has unexpected SHA-256 ${prepared.manifest.archive.sha256}.`,
    )
  }
  await mirrorCsdiSourceArchive(
    { environment: 'dev', remote: false },
    archive,
    prepared,
  )
  return resolveLocalSourceArchiveKey(release.contentHash)
}

type SourceArchiveAsset = {
  assetKey: string
  contentHash: string
  role: string
}

/**
 * Finds the immutable CSDI archive through the local asset registry. Archive
 * slots identify the publisher release, whereas the registry owns physical
 * R2 placement and may change that layout independently.
 */
export async function resolveLocalSourceArchiveKey(contentHash: string) {
  const assets = await withLocalMetaDb(db =>
    db
      .select({
        assetKey: metaAssets.assetKey,
        contentHash: metaAssets.contentHash,
        role: metaAssets.role,
      })
      .from(metaAssets)
      .where(
        and(
          eq(metaAssets.contentHash, contentHash),
          eq(metaAssets.role, 'sourceArchive'),
        ),
      )
      .all(),
  )
  return selectSourceArchiveKey(contentHash, assets)
}

export function selectSourceArchiveKey(
  contentHash: string,
  assets: readonly SourceArchiveAsset[],
) {
  const keys = [
    ...new Set(
      assets
        .filter(
          asset => asset.role === 'sourceArchive' && asset.contentHash === contentHash,
        )
        .map(asset => asset.assetKey),
    ),
  ]
  if (keys.length !== 1) {
    throw new Error(
      keys.length === 0
        ? `No local sourceArchive asset is registered for CSDI archive ${contentHash}.`
        : `Multiple local sourceArchive assets are registered for CSDI archive ${contentHash}: ${keys.join(', ')}.`,
    )
  }
  const key = keys[0]
  if (!key) throw new Error('Source archive key resolution returned no key.')
  return key
}

async function readLocalSourceArchive(objectKey: string, outputFile: string) {
  const child = Bun.spawn(
    [
      'bun',
      'x',
      'wrangler',
      'r2',
      'object',
      'get',
      `ss-assets-preview/${objectKey}`,
      '--file',
      outputFile,
      '--local',
      '--persist-to',
      join(REPO_ROOT, '.local/d1/dev'),
      '--config',
      join(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc'),
    ],
    { cwd: REPO_ROOT, stderr: 'pipe', stdout: 'pipe' },
  )
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (status !== 0)
    throw new Error(
      (stderr || stdout || 'Could not read the mirrored CSDI archive.').trim(),
    )
}
