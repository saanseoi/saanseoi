import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import { confirm, isCancel, note, outro } from '@clack/prompts'
import { metaSchema } from '@repo/db'
import { resolveDatasetRecord } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { getStringOption } from '../cli/options.ts'
import { resolveCurrentWriteContext } from '../dbCache/currentWriteContext.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../pipeline/local/nativeSqlDelivery.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from '../pipeline/local/releaseSqlDelivery.ts'
import { completeSqlDeliveryRelease } from '../pipeline/local/sqlDeliveryPending.ts'
import { withDeliveryLock } from '../pipeline/local/sqlDeliveryFiles.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../pipeline/addresses/processLocalAddressSqlUploadImport.ts'
import { resolveRollbackShardHints } from './rollbackTargets.ts'
import {
  captureRollbackDelivery,
  type RollbackClaim,
  type RollbackTerminal,
} from './rollbackDelivery.ts'
import {
  prepareRollbackMetadata,
  resolveRollbackSelection,
  rollbackSnapshotScope,
  type RollbackSnapshot,
} from './rollbackSelection.ts'
import {
  restoreSnapshotProjection,
  type ProjectionResourceType,
} from './rollback/projection.ts'
import { restorePlaceDerivedRows } from './rollback/places.ts'
import { restoreStatisticsProjection } from './rollback/statistics.ts'
import type { NetTablePolicy } from '../pipeline/local/netSqlitePlanTypes.ts'

type RollbackResourceType = ProjectionResourceType | 'divisionStatistic'
const familyTables: Record<RollbackResourceType, string[]> = {
  division: ['divisions', 'divisionsI18n'],
  divisionArea: ['divisionAreas'],
  divisionBoundary: ['divisionBoundaries'],
  address: [
    'address2d',
    'address2dI18n',
    'address2dBuildingNumberLookup',
    'address3d',
    'address3dI18n',
  ],
  place: ['places', 'placesI18n', 'placesCells', 'placesDivision'],
  street: [
    'streets',
    'streetsI18n',
    'streetChangelog',
    'streetGeometry',
    'streetNameChanges',
    'streetNameChangeStreets',
    'streetsAddress',
  ],
  divisionStatistic: [
    'statsRecords',
    'statsFields',
    'statsFieldsI18n',
    'statsMeasures',
    'statsMeasuresI18n',
  ],
}

const familyForTable = (table: string): RollbackResourceType => {
  for (const [family, tables] of Object.entries(familyTables))
    if (tables.includes(table)) return family as RollbackResourceType
  throw new Error(`Unknown rollback table ${table}.`)
}
const scopeColumn = (table: string) =>
  table === 'placesDivision'
    ? 'placeSnapshotId'
    : table === 'streetsAddress'
      ? 'streetSnapshotId'
      : 'snapshotId'

/** Current-only reconstruction preserves retained evidence and emits keyed row differences. */
export async function prepareReconstructedRollback(input: {
  context: LocalAddressDbContext
  releaseId: string
  append: Parameters<typeof captureRollbackDelivery>[0]['append']
}) {
  const metaPath = input.context.state.files?.DB_META
  if (!metaPath) throw new Error('Rollback requires DB_META.')
  const baseline = new Database(metaPath, { readonly: true, create: false })
  let families: RollbackResourceType[]
  try {
    const selection = resolveRollbackSelection(baseline, input.releaseId)
    families = [
      ...new Set(
        [...selection.changes, ...selection.restores].map(
          snapshot => snapshot.resourceType,
        ),
      ),
    ]
  } finally {
    baseline.close()
  }
  const tables: NetTablePolicy[] = families.flatMap(family =>
    familyTables[family].map(name => ({
      name,
      ignoredColumns: ['createdAt', 'updatedAt'],
      rowScope: {
        column: family === 'divisionStatistic' ? 'datasetCode' : scopeColumn(name),
        values: [] as string[],
      },
      ...(family === 'address' && ['address3d', 'address3dI18n'].includes(name)
        ? {
            collection: {
              name: 'address3d',
              keyColumns: ['snapshotId', name === 'address3d' ? 'id' : 'address3dId'],
            },
          }
        : {}),
    })),
  )
  return captureRollbackDelivery({
    context: input.context,
    tables,
    append: input.append,
    prepare: async (current, meta) => {
      const selection = resolveRollbackSelection(meta, input.releaseId)
      const metaDb = drizzle({
        client: meta,
        schema: metaSchema,
      }) as unknown as HarbourReadableDb
      const historyTargets = input.context.historyTargets.map(target => ({
        bindingName: target.bindingName,
        db: target.db as HarbourReadableDb,
      }))
      const claims: RollbackClaim[] = []
      const statisticsSnapshots = selection.changes.filter(
        snapshot => snapshot.resourceType === 'divisionStatistic',
      )
      if (statisticsSnapshots.length) {
        const datasetCode = meta
          .query<{ code: string }, [string]>('SELECT code FROM datasets WHERE id=?')
          .get(selection.release.datasetId)?.code
        if (!datasetCode) throw new Error('Statistics rollback dataset is missing.')
        for (const policy of tables)
          if (familyForTable(policy.name) === 'divisionStatistic')
            policy.rowScope!.values.push(datasetCode)
        for (const snapshot of statisticsSnapshots) {
          const receipt = current
            .query<
              { snapshotId: string; status: string; updatedAt: string },
              [string, string]
            >(
              'SELECT snapshotId,status,updatedAt FROM statsPublicationState WHERE datasetCode=? AND referencePeriodCode=?',
            )
            .get(datasetCode, snapshot.cohortKey)
          if (
            !receipt ||
            receipt.snapshotId !== snapshot.id ||
            receipt.status !== 'current'
          )
            throw new Error(
              'Statistics rollback target no longer owns its exact-period selection.',
            )
          const identity = { datasetCode, referencePeriodCode: snapshot.cohortKey }
          claims.push({
            table: 'statsPublicationState',
            scopeId: JSON.stringify([datasetCode, snapshot.cohortKey]),
            statistics: identity,
            previous: {
              snapshotId: receipt.snapshotId,
              publicationToken: receipt.updatedAt,
            },
            snapshotId: snapshot.parentSnapshotId,
            publicationToken: new Date().toISOString(),
          })
          await restoreStatisticsProjection({
            current,
            metaDb,
            historyTargets,
            snapshotId: snapshot.parentSnapshotId,
            ...identity,
          })
        }
      }
      const scopes = new Map<
        string,
        {
          family: ProjectionResourceType
          scopeId: string
          from: RollbackSnapshot | null
          to: RollbackSnapshot | null
        }
      >()
      for (const [snapshots, direction] of [
        [selection.changes, 'from'],
        [selection.restores, 'to'],
      ] as const) {
        for (const snapshot of snapshots) {
          if (snapshot.resourceType === 'divisionStatistic') continue
          const scopeId = rollbackSnapshotScope(snapshot)
          const key = JSON.stringify([snapshot.resourceType, scopeId])
          const item = scopes.get(key) ?? {
            family: snapshot.resourceType,
            scopeId,
            from: null,
            to: null,
          }
          if (item[direction])
            throw new Error(
              'Rollback composition selects conflicting snapshots for one current scope.',
            )
          item[direction] = snapshot
          scopes.set(key, item)
        }
      }
      const preparedDependencies = new Map<
        string,
        { resourceType: 'division' | 'street'; scopeId: string }
      >()
      const dependencyOrder = [
        'division',
        'street',
        'address',
        'place',
        'divisionArea',
        'divisionBoundary',
      ]
      for (const scope of [...scopes.values()].sort(
        (a, b) => dependencyOrder.indexOf(a.family) - dependencyOrder.indexOf(b.family),
      )) {
        const table = `${scope.family}PublicationState`
        const receipt = current
          .query<
            {
              snapshotId: string
              publicationToken: string
              preparedAt: string | null
              status: string
            },
            [string]
          >(`SELECT * FROM ${table} WHERE scopeId=?`)
          .get(scope.scopeId)
        if (
          !scope.from &&
          receipt &&
          receipt?.snapshotId === scope.to?.id &&
          receipt.status === 'current' &&
          receipt.preparedAt &&
          receipt.publicationToken
        )
          continue
        if (
          scope.from &&
          (!receipt ||
            receipt.snapshotId !== scope.from.id ||
            receipt.status !== 'current' ||
            !receipt.preparedAt ||
            !receipt.publicationToken)
        )
          throw new Error(
            `Rollback target ${scope.from.id} no longer owns a completed current projection.`,
          )
        if (!scope.from && receipt)
          throw new Error('Rollback predecessor scope is owned by another publication.')
        const claim: RollbackClaim = {
          table,
          scopeId: scope.scopeId,
          previous: receipt
            ? {
                snapshotId: receipt.snapshotId,
                publicationToken: receipt.publicationToken,
              }
            : null,
          snapshotId: scope.to?.id ?? null,
          publicationToken: crypto.randomUUID(),
        }
        claims.push(claim)
        for (const policy of tables)
          if (familyForTable(policy.name) === scope.family)
            policy.rowScope!.values.push(scope.scopeId)
        if (scope.to) {
          await restoreSnapshotProjection({
            current,
            metaDb,
            historyTargets,
            snapshotId: scope.to.id,
            scopeId: scope.scopeId,
            resourceType: scope.family,
            cacheDir: input.context.state.dbCacheDir,
            preparedDependencies,
            deferForeignKeyValidation: true,
          })
          if (scope.family === 'division' || scope.family === 'street')
            preparedDependencies.set(scope.to.id, {
              resourceType: scope.family,
              scopeId: scope.scopeId,
            })
          if (scope.family === 'place')
            await restorePlaceDerivedRows({
              current,
              metaDb,
              historyTargets,
              snapshotId: scope.to.id,
              scopeId: scope.scopeId,
            })
        } else {
          current.exec('PRAGMA foreign_keys=OFF')
          try {
            current.transaction(() => {
              for (const name of familyTables[scope.family].toReversed())
                current
                  .query(`DELETE FROM "${name}" WHERE "${scopeColumn(name)}"=?`)
                  .run(scope.scopeId)
            })()
          } finally {
            current.exec('PRAGMA foreign_keys=ON')
          }
        }
      }
      if (current.query('PRAGMA foreign_key_check').get())
        throw new Error(
          'Rollback reconstruction would invalidate a dependent current family.',
        )
      const metadata = prepareRollbackMetadata(
        meta,
        selection,
        new Date().toISOString(),
      )
      metadata.terminal.claims = claims
      return {
        ...metadata,
        claims,
        details: {
          releaseCode: selection.release.code,
          restoredSnapshots: selection.restores.map(snapshot => snapshot.id),
          removedSnapshots: selection.changes.map(snapshot => snapshot.id),
        },
      }
    },
  })
}

export async function runReconstructRollbackCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: { dryRun: boolean; skipConfirm: boolean; printUsage: () => void },
) {
  const specifier = getStringOption(args, ['release']) ?? args.positionals[0]
  if (!specifier) {
    options.printUsage()
    throw new Error('Pass --release <release-id|code>.')
  }
  const hints = resolveRollbackShardHints(args, specifier)
  const context = await resolveCurrentWriteContext(
    target,
    hints.regionCode,
    hints.shardYear,
  )
  try {
    const release = await resolveDatasetRecord(
      context.metaDb as unknown as HarbourReadableDb,
      { releaseId: specifier, releaseCode: specifier },
    )
    if (!release) throw new Error(`Release not found: ${specifier}.`)
    const directory = resolve(
      import.meta.dir,
      '../../../../../.local/harbour-sql/rollbacks',
      context.state.target,
      encodeURIComponent(release.releaseId),
      'reconstruction',
    )
    const generate = (
      append: Parameters<typeof captureRollbackDelivery>[0]['append'],
    ) => prepareReconstructedRollback({ context, releaseId: release.releaseId, append })
    if (options.dryRun) {
      const result = await withDeliveryLock(
        resolve(context.state.dbCacheDir, 'sql-delivery-lock'),
        async () => {
          await mkdir(directory, { recursive: true })
          let batch = 0
          const result = await generate(async (destination, bytes) => {
            await writeFile(
              resolve(directory, `preview-${batch++}-${destination.bindingName}.json`),
              bytes,
            )
          })
          await writeFile(
            resolve(directory, 'preview.json'),
            JSON.stringify(result, null, 2),
          )
          return result
        },
      )
      note(JSON.stringify({ directory, ...result }, null, 2), 'ROLLBACK PREVIEW')
      return
    }
    const phase = 'rollback-reconstruction'
    const inputs = { operation: 'rollback', releaseId: release.releaseId }
    const files = context.state.files!
    const plan =
      context.state.target === 'local'
        ? await prepareNativeSqlDelivery({
            directory,
            ownershipDirectory: context.state.dbCacheDir,
            releaseId: release.releaseId,
            phase,
            inputs,
            files,
            generate,
          })
        : await prepareReleaseSqlDelivery({
            directory,
            context,
            releaseId: release.releaseId,
            phase,
            inputs,
            generate: append =>
              generate((destination, bytes, kind) => append(destination, bytes, kind)),
          })
    note(JSON.stringify({ directory, ...plan.outputs }, null, 2), 'SEALED ROLLBACK')
    if (!options.skipConfirm) {
      const answer = await confirm({
        message: `Restore the retained predecessor of ${release.releaseCode} on ${context.state.target}?`,
        initialValue: false,
      })
      if (isCancel(answer) || !answer)
        throw new Error(
          `Rollback retained without execution. Resume the sealed plan at ${directory} when approved.`,
        )
    }
    if (context.state.target === 'local')
      await runNativeSqlDelivery(directory, { files })
    else {
      const credentials = {
        accountId: resolveCloudflareAccountId(target),
        apiToken: resolveCloudflareD1ApiToken(),
      }
      await executeReleaseSqlDelivery({
        directory,
        context,
        ...credentials,
        mode: 'remote',
      })
      await executeReleaseSqlDelivery({
        directory,
        context,
        ...credentials,
        mode: 'local',
      })
    }
    const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
    if (!terminal) throw new Error('Rollback plan is missing its completion contract.')
    await verifyRollbackTerminal(files, terminal)
    if (
      !(await completeSqlDeliveryRelease(context.state.dbCacheDir, release.releaseId))
    )
      throw new Error('Rollback delivery has not acknowledged every sealed batch.')
    outro(
      `Restored ${release.releaseCode}'s predecessor. Published history and source evidence are retained.`,
    )
  } finally {
    context.cleanup()
  }
}

export async function verifyRollbackTerminal(
  files: Record<string, string>,
  terminal: RollbackTerminal,
) {
  const { rollbackClaimPredicate, rollbackClaimScopePredicate } = await import(
    './rollbackDelivery.ts'
  )
  const meta = new Database(files.DB_META!, { readonly: true, create: false })
  const current = new Database(files.DB_CURRENT!, { readonly: true, create: false })
  try {
    if (
      meta
        .query<{ status: string }, [string]>('SELECT status FROM releases WHERE id=?')
        .get(terminal.releaseId)?.status !== 'revoked'
    )
      throw new Error('Rollback source release has not been revoked.')
    const catalog = meta
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM apiCatalogRevisions WHERE apiVersionId=? AND regionCode=? AND status='current' ORDER BY publishedAt DESC,revision DESC LIMIT 1",
      )
      .get(terminal.apiVersionId, terminal.regionCode)
    if (catalog?.id !== terminal.catalogId)
      throw new Error('Rollback catalogue selection does not match its sealed result.')
    for (const claim of terminal.claims) {
      if (claim.snapshotId) {
        if (
          !current.query(`SELECT 1 WHERE ${rollbackClaimPredicate(claim, true)}`).get()
        )
          throw new Error(
            'Rollback predecessor is not ready with its sealed publication token.',
          )
      } else if (
        current
          .query(
            `SELECT 1 FROM "${claim.table}" WHERE ${rollbackClaimScopePredicate(claim)}`,
          )
          .get()
      )
        throw new Error('Rollback scope removal is incomplete.')
    }
    if (current.query('PRAGMA foreign_key_check').get())
      throw new Error('Rollback current references are invalid.')
  } finally {
    meta.close()
    current.close()
  }
}
