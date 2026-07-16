import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { prepareHkgovPlandTpuParquet } from '../hkgovPland.ts'
import { prepareHkgovPlandNewTownParquet } from '../hkgovPlandNewTown.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'
import { runUploadCommand } from './upload.ts'

type BackfillKind = 'newtown' | 'pu'

type BackfillRelease = {
  catalogueUrl: string
  fileName: string
  year: string
}

const PLANNING_UNIT_RELEASES: BackfillRelease[] = [
  {
    year: '2001',
    fileName: 'hkgov-pland-tpu-2001.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535158118_80594',
  },
  {
    year: '2006',
    fileName: 'hkgov-pland-tpu-2006.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535383021_30595',
  },
  {
    year: '2011',
    fileName: 'hkgov-pland-tpu-2011.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634025118087_40967',
  },
  {
    year: '2016',
    fileName: 'hkgov-pland-tpu-2016.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281887222_15002',
  },
  {
    year: '2021',
    fileName: 'hkgov-pland-tpu-2021.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634022783366_65050',
  },
]

const NEW_TOWN_RELEASES: BackfillRelease[] = [
  {
    year: '2006',
    fileName: 'hkgov-pland-new-town-2006.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535014241_1352',
  },
  {
    year: '2011',
    fileName: 'hkgov-pland-new-town-2011.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634024777903_55269',
  },
  {
    year: '2016',
    fileName: 'hkgov-pland-new-town-2016.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281414408_50485',
  },
  {
    year: '2021',
    fileName: 'hkgov-pland-new-town-2021.geojson',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634023103904_16865',
  },
]

export async function runHkgovPlandBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  kind: BackfillKind,
  printUsage: () => void,
) {
  assertBackfillArguments(args, printUsage)
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const releases = kind === 'pu' ? PLANNING_UNIT_RELEASES : NEW_TOWN_RELEASES
  const source = kind === 'pu' ? 'hkgov-pland-pu' : 'hkgov-pland-newtown'
  const artifactRoot = resolve(invocationCwd, 'data/hkgov/pland')
  const outputDir = await mkdtemp(join(tmpdir(), `harbour-${source}-backfill-`))

  try {
    for (const release of releases) {
      const inputFile = resolve(artifactRoot, release.year, release.fileName)
      const divisionFile = join(
        outputDir,
        `${source}-hk-${release.year}-division.parquet`,
      )
      const divisionAreaFile = join(
        outputDir,
        `${source}-hk-${release.year}-divisionArea.parquet`,
      )
      if (kind === 'pu') {
        await Promise.all([
          prepareHkgovPlandTpuParquet({
            inputFile,
            outputFile: divisionFile,
            sourceVersion: release.year,
            type: 'division',
          }),
          prepareHkgovPlandTpuParquet({
            inputFile,
            outputFile: divisionAreaFile,
            sourceVersion: release.year,
            type: 'divisionArea',
          }),
        ])
      } else {
        await Promise.all([
          prepareHkgovPlandNewTownParquet({
            inputFile,
            outputFile: divisionFile,
            sourceVersion: release.year,
            type: 'division',
          }),
          prepareHkgovPlandNewTownParquet({
            inputFile,
            outputFile: divisionAreaFile,
            sourceVersion: release.year,
            type: 'divisionArea',
          }),
        ])
      }

      await uploadPreparedArtifact({
        filePath: divisionFile,
        invocationCwd,
        release,
        source,
        target,
        type: 'division',
      })
      await uploadPreparedArtifact({
        filePath: divisionAreaFile,
        invocationCwd,
        release,
        source,
        target,
        type: 'divisionArea',
      })
    }
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
}

async function uploadPreparedArtifact(args: {
  filePath: string
  invocationCwd: string
  release: BackfillRelease
  source: string
  target: UploadTarget
  type: 'division' | 'divisionArea'
}) {
  const uploadArgs: ParsedArgs = {
    command: 'upload',
    positionals: [args.filePath],
    options: {
      'cohort-key': args.release.year,
      'release-notes-url': args.release.catalogueUrl,
      region: 'hk',
      source: args.source,
      'source-version': args.release.year,
      theme: 'divisions',
      type: args.type,
      yes: true,
    },
  }
  await runUploadCommand(uploadArgs, args.target, {
    dryRun: false,
    forceUpload: false,
    invocationCwd: args.invocationCwd,
    printUsage: () => undefined,
    skipConfirm: true,
    skipSnapshotCleanup: false,
    validateGeometry: args.type === 'divisionArea',
  })
}

function assertBackfillArguments(args: ParsedArgs, printUsage: () => void) {
  const invalidOptions = Object.keys(args.options).filter(key => key !== 'target')
  if (
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    typeof args.options.target !== 'string' ||
    !['local', 'preview', 'production'].includes(args.options.target)
  ) {
    printUsage()
    throw new Error(
      'Planning Department backfill requires exactly --target local|preview|production.',
    )
  }
}
