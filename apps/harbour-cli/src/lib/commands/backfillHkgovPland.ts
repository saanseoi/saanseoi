import { createHash, createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { prepareHkgovPlandTpuParquet } from '../hkgovPland.ts'
import { prepareHkgovPlandNewTownParquet } from '../hkgovPlandNewTown.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'
import { runUploadCommand } from './upload.ts'
import { buildDatasetReleaseCode } from '@repo/core'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  REPO_ROOT,
  'apps/harbour-api/wrangler.jsonc',
)
const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')

type BackfillKind = 'new-town' | 'pu'

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
  const continueUpload = Boolean(args.options.continue)
  if (continueUpload && target.remote) {
    throw new Error(
      '`--continue` is only supported for local Planning Department backfills.',
    )
  }
  const completedReleaseCodes = continueUpload
    ? await getCompletedLocalReleaseCodes()
    : new Set<string>()
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const releases = kind === 'pu' ? PLANNING_UNIT_RELEASES : NEW_TOWN_RELEASES
  const source = kind === 'pu' ? 'hkgov-pland-pu' : 'hkgov-pland-new-town'
  const artifactRoot = resolve(REPO_ROOT, 'data/hkgov/pland')
  const outputDir = await mkdtemp(join(tmpdir(), `harbour-${source}-backfill-`))

  try {
    for (const release of releases) {
      const types = (['division', 'divisionArea'] as const).filter(type => {
        const releaseCode = buildDatasetReleaseCode('hk', source, release.year, type)
        return !completedReleaseCodes.has(releaseCode)
      })

      if (types.length === 0) {
        console.log(`Skipping completed ${source} ${release.year} backfill.`)
        continue
      }

      const inputFile = resolve(artifactRoot, release.year, release.fileName)
      const divisionFile = join(
        outputDir,
        `${source}-hk-${release.year}-division.parquet`,
      )
      const divisionAreaFile = join(
        outputDir,
        `${source}-hk-${release.year}-division-area.parquet`,
      )
      const prepare =
        kind === 'pu' ? prepareHkgovPlandTpuParquet : prepareHkgovPlandNewTownParquet
      await Promise.all(
        types.map(type =>
          prepare({
            inputFile,
            outputFile: type === 'division' ? divisionFile : divisionAreaFile,
            sourceVersion: release.year,
            type,
          }),
        ),
      )

      for (const type of types) {
        await uploadPreparedArtifact({
          filePath: type === 'division' ? divisionFile : divisionAreaFile,
          invocationCwd,
          release,
          source,
          target,
          type,
        })
      }
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
  const invalidOptions = Object.keys(args.options).filter(
    key => key !== 'continue' && key !== 'target',
  )
  if (
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    (args.options.continue !== undefined && args.options.continue !== true) ||
    typeof args.options.target !== 'string' ||
    !['local', 'preview', 'production'].includes(args.options.target)
  ) {
    printUsage()
    throw new Error(
      'Planning Department backfill requires exactly --target local|preview|production.',
    )
  }
}

async function getCompletedLocalReleaseCodes() {
  const sqlite = new SQLiteDatabase(await resolveLocalMetaDatabasePath(), {
    readonly: true,
  })

  try {
    const completedReleaseCodes = new Set<string>()
    const releases = sqlite
      .query("SELECT code FROM releases WHERE status IN ('published', 'superseded')")
      .all() as Array<{ code: string }>

    for (const release of releases) {
      completedReleaseCodes.add(release.code)
    }

    return completedReleaseCodes
  } finally {
    sqlite.close()
  }
}

async function resolveLocalMetaDatabasePath() {
  const config = JSON.parse(await readFile(HARBOUR_API_WRANGLER_CONFIG, 'utf8')) as {
    d1_databases?: Array<Record<string, unknown>>
    env?: { preview?: { d1_databases?: Array<Record<string, unknown>> } }
  }
  const databases = config.env?.preview?.d1_databases ?? config.d1_databases ?? []
  const metaDatabase = databases.find(database => database.binding === 'DB_META')
  const localDatabaseId =
    metaDatabase?.preview_database_id ??
    metaDatabase?.database_id ??
    metaDatabase?.binding

  if (typeof localDatabaseId !== 'string') {
    throw new Error('Could not resolve the local DB_META database identifier.')
  }

  const uniqueKey = 'miniflare-D1DatabaseObject'
  const key = createHash('sha256').update(uniqueKey).digest()
  const nameHmac = createHmac('sha256', key)
    .update(localDatabaseId)
    .digest()
    .subarray(0, 16)
  const objectId = Buffer.concat([
    nameHmac,
    createHmac('sha256', key).update(nameHmac).digest().subarray(0, 16),
  ]).toString('hex')
  const databasePath = resolve(
    LOCAL_D1_PERSIST_ROOT,
    'v3/d1/miniflare-D1DatabaseObject',
    `${objectId}.sqlite`,
  )

  if (!existsSync(databasePath)) {
    throw new Error(
      `Cannot continue Planning Department backfills: local metadata database not found at ${databasePath}.`,
    )
  }

  return databasePath
}
