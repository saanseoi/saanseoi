import { createHash, createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { prepareHkgovPlandTpuNativeShpZip } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovPland.ts'
import { prepareHkgovPlandNewTownNativeShpZip } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovPlandNewTown.ts'
import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { readRemoteCachedCompletedReleaseCodes } from '../../../harbour-cli/src/lib/dbCache/localDbCache.ts'
import { buildDatasetReleaseCode } from '@repo/core'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  REPO_ROOT,
  'apps/harbour-api/wrangler.jsonc',
)
const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')

type BackfillKind = 'new-town' | 'pu'

type BackfillRelease = {
  archiveDatasetId: string
  catalogueUrl: string
  year: string
}

type BackfillDependencies = {
  prepareHkgovPlandNewTownNativeShpZip?: typeof prepareHkgovPlandNewTownNativeShpZip
  prepareHkgovPlandTpuNativeShpZip?: typeof prepareHkgovPlandTpuNativeShpZip
  runUploadCommand?: typeof runUploadCommand
  getCompletedReleaseCodes?: (target: UploadTarget) => Promise<Set<string>>
}

const PLANNING_UNIT_RELEASES: BackfillRelease[] = [
  {
    year: '2001',
    archiveDatasetId: 'pland_rcd_1636535158118_80594',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535158118_80594',
  },
  {
    year: '2006',
    archiveDatasetId: 'pland_rcd_1636535383021_30595',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535383021_30595',
  },
  {
    year: '2011',
    archiveDatasetId: 'pland_rcd_1634025118087_40967',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634025118087_40967',
  },
  {
    year: '2016',
    archiveDatasetId: 'pland_rcd_1634281887222_15002',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281887222_15002',
  },
  {
    year: '2021',
    archiveDatasetId: 'pland_rcd_1634022783366_65050',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634022783366_65050',
  },
]

const NEW_TOWN_RELEASES: BackfillRelease[] = [
  {
    year: '2006',
    archiveDatasetId: 'pland_rcd_1636535014241_1352',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535014241_1352',
  },
  {
    year: '2011',
    archiveDatasetId: 'pland_rcd_1634024777903_55269',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634024777903_55269',
  },
  {
    year: '2016',
    archiveDatasetId: 'pland_rcd_1634281414408_50485',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281414408_50485',
  },
  {
    year: '2021',
    archiveDatasetId: 'pland_rcd_1634023103904_16865',
    catalogueUrl:
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634023103904_16865',
  },
]

export async function runHkgovPlandBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  kind: BackfillKind,
  printUsage: () => void,
  dependencies: BackfillDependencies = {},
) {
  assertBackfillArguments(args, printUsage)
  const continueUpload = Boolean(args.options.continue)
  const completedReleaseCodes = continueUpload
    ? await (dependencies.getCompletedReleaseCodes ?? getCompletedReleaseCodes)(target)
    : new Set<string>()
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const releases = kind === 'pu' ? PLANNING_UNIT_RELEASES : NEW_TOWN_RELEASES
  const source = kind === 'pu' ? 'hkgov-pland-pu' : 'hkgov-pland-new-town'
  const sourceArchiveRoot = resolve(REPO_ROOT, 'data/hkgov/csdi/archive')
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

      const inputFile = resolve(
        sourceArchiveRoot,
        release.archiveDatasetId,
        '2023-Q4/source.zip',
      )
      const divisionFile = join(
        outputDir,
        `${source}-hk-${release.year}-division.parquet`,
      )
      const divisionAreaFile = join(
        outputDir,
        `${source}-hk-${release.year}-division-area.parquet`,
      )
      const prepare =
        kind === 'pu'
          ? (dependencies.prepareHkgovPlandTpuNativeShpZip ??
            prepareHkgovPlandTpuNativeShpZip)
          : (dependencies.prepareHkgovPlandNewTownNativeShpZip ??
            prepareHkgovPlandNewTownNativeShpZip)
      // The 2021 native TPU aggregate performs topology canonicalisation over
      // thousands of source cells. Prepare the two artefacts serially so their
      // geometry workspaces do not compete for the local process memory.
      for (const type of types) {
        await prepare({
          inputFile,
          outputFile: type === 'division' ? divisionFile : divisionAreaFile,
          sourceVersion: release.year,
          type,
        })
      }

      for (const type of types) {
        await uploadPreparedArtefact({
          filePath: type === 'division' ? divisionFile : divisionAreaFile,
          invocationCwd,
          release,
          source,
          target,
          type,
          forceUpload: continueUpload,
          runUploadCommand: dependencies.runUploadCommand,
        })
      }
    }
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
}

/** Publish one already-mirrored native CSDI SHP archive after updater approval. */
export async function runHkgovPlandNativeArchiveIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  kind: BackfillKind,
  printUsage: () => void,
) {
  const inputFile = args.positionals[0]
  const sourceVersion = args.options['source-version']
  const catalogueUrl = args.options['release-notes-url']
  const sourceArchiveKey = args.options['source-archive-key']
  const sourceArchiveSha256 = args.options['source-archive-sha256']
  if (
    !inputFile ||
    args.positionals.length !== 1 ||
    typeof sourceVersion !== 'string' ||
    typeof catalogueUrl !== 'string' ||
    typeof sourceArchiveKey !== 'string' ||
    !isSha256(sourceArchiveSha256)
  ) {
    printUsage()
    throw new Error(
      'Planning Department native archive intake requires <source.zip>, --source-version, --release-notes-url, --source-archive-key, and --source-archive-sha256.',
    )
  }
  const sourceArchiveBytes = await readFile(resolve(inputFile))
  assertSourceArchiveHash(
    sourceArchiveBytes,
    sourceArchiveSha256,
    'Prepared Planning Department archive',
  )
  const source = kind === 'pu' ? 'hkgov-pland-pu' : 'hkgov-pland-new-town'
  const release: BackfillRelease = {
    archiveDatasetId: '',
    catalogueUrl,
    year: sourceVersion,
  }
  const outputDir = await mkdtemp(join(tmpdir(), `harbour-${source}-archive-`))
  try {
    const sourceArchivePath = join(outputDir, 'verified-source.zip')
    await writeFile(sourceArchivePath, sourceArchiveBytes, { flag: 'wx' })
    const divisionFile = join(
      outputDir,
      `${source}-hk-${sourceVersion}-division.parquet`,
    )
    const divisionAreaFile = join(
      outputDir,
      `${source}-hk-${sourceVersion}-division-area.parquet`,
    )
    const prepare =
      kind === 'pu'
        ? prepareHkgovPlandTpuNativeShpZip
        : prepareHkgovPlandNewTownNativeShpZip
    for (const type of ['division', 'divisionArea'] as const) {
      await prepare({
        inputFile: sourceArchivePath,
        outputFile: type === 'division' ? divisionFile : divisionAreaFile,
        sourceVersion,
        type,
      })
    }
    const invocationCwd = process.env.INIT_CWD ?? process.cwd()
    for (const type of ['division', 'divisionArea'] as const) {
      await uploadPreparedArtefact({
        filePath: type === 'division' ? divisionFile : divisionAreaFile,
        invocationCwd,
        release,
        source,
        sourceArchiveKey,
        sourceArchiveSha256,
        target,
        type,
        forceUpload: false,
      })
    }
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
}

async function uploadPreparedArtefact(args: {
  filePath: string
  invocationCwd: string
  release: BackfillRelease
  source: string
  sourceArchiveKey?: string
  sourceArchiveSha256?: string
  target: UploadTarget
  type: 'division' | 'divisionArea'
  forceUpload: boolean
  runUploadCommand?: typeof runUploadCommand
}) {
  const uploadArgs: ParsedArgs = {
    command: 'upload',
    positionals: [args.filePath],
    options: {
      'cohort-key': args.release.year,
      'release-notes-url': args.release.catalogueUrl,
      region: 'hk',
      source: args.source,
      ...(args.sourceArchiveKey && args.sourceArchiveSha256
        ? {
            'source-archive-key': args.sourceArchiveKey,
            'source-archive-sha256': args.sourceArchiveSha256,
          }
        : {}),
      'source-version': args.release.year,
      theme: 'divisions',
      type: args.type,
      yes: true,
    },
  }
  await (args.runUploadCommand ?? runUploadCommand)(uploadArgs, args.target, {
    dryRun: false,
    forceUpload: args.forceUpload,
    invocationCwd: args.invocationCwd,
    printUsage: () => undefined,
    skipConfirm: true,
    // A Planning Department division snapshot is the required referent for its
    // companion area release. Keep it materialised while this cohort's area is
    // uploaded; the area publication can then schedule ordinary cleanup.
    skipSnapshotCleanup: args.type === 'division',
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

async function getCompletedReleaseCodes(target: UploadTarget) {
  if (target.remote) {
    return new Set(
      await readRemoteCachedCompletedReleaseCodes(target, {
        allowPartialCache: true,
      }),
    )
  }

  return getCompletedLocalReleaseCodes()
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
