import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { unzipSync } from 'fflate'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { prepareHkgovCenstatdDistrictStatisticUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'

const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const DATASET_ID = 'censtatd_rcd_1635934215448_25451'
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
    const archivePath = join(workDir, 'source.zip')
    await readLocalSourceArchive(release.objectKey, archivePath)
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
      sourceArchiveKey: release.objectKey,
      sourceVersion,
    })
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [parquetPath],
        options: {
          'cohort-key': sourceVersion,
          region: 'hk',
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
        forceUpload: false,
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
      archiveSlots?: Array<{ contentHash?: string; releaseSlot?: string }>
    }>
  }
  const slot = fixture.releases?.find(
    release => release.sourceVersion === sourceVersion,
  )?.archiveSlots?.[0]
  if (!slot?.contentHash || !slot.releaseSlot)
    throw new Error(`Fixture lacks the CSDI archive mapping for ${sourceVersion}.`)
  return {
    objectKey: `by-source/hk/hkgov-csdi/${DATASET_ID}/${slot.releaseSlot}/${slot.contentHash}-source.zip`,
  }
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
