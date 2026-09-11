import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { captureResolvedSqlPlan } from '../local/resolvedSqlPlan.ts'
import type { NetTablePolicy } from '../local/netSqlitePlan.ts'
import type { SqlDeliveryTarget } from '../local/sqlDeliveryTypes.ts'
import { importPlaceSqlBatches } from './processLocalPlaceSqlUploadImport.ts'
import {
  loadCurrentPlaceHistory,
  loadCurrentPlaceSources,
} from './processLocalPlaceSqlUploadRows.ts'
import type {
  BuildPlaceSqlInput,
  PlaceSqlProgressEvent,
} from './processLocalPlaceSqlUploadTypes.ts'
import { validateResolvedPlaces } from './resolvedPlaceValidation.ts'
import { loadPreviousPlaceSourceResolutions } from './placeHistory.ts'

export function placeMutationTables(binding: string): NetTablePolicy[] {
  const names =
    binding === 'DB_CURRENT'
      ? ['places', 'placesI18n', 'placesCells', 'placesDivision']
      : binding.startsWith('DB_HISTORY_')
        ? ['places', 'placesI18n', 'snapshotVersionChanges', 'sourceResolutions']
        : binding.startsWith('DB_SOURCE_')
          ? ['overturePlaces']
          : []
  return names.map(name => ({
    name,
    ...(name !== 'sourceResolutions'
      ? {
          ignoredColumns: ['createdAt', 'updatedAt'].filter(
            () => !['placesCells', 'placesDivision'].includes(name),
          ),
        }
      : {}),
  }))
}

/** All family writes execute locally; only final owned row differences are sealed. */
export async function captureResolvedPlaceDelivery(input: {
  context: LocalAddressDbContext
  sqlInput: BuildPlaceSqlInput
  path: string
  totalRows: number
  timestamp: string
  onProgress?: (event: PlaceSqlProgressEvent) => void
  capture: (
    target: SqlDeliveryTarget,
    bytes: Uint8Array,
    kind: 'bound',
  ) => Promise<void>
}) {
  const files = input.context.state.files
  if (!files?.DB_CURRENT)
    throw new Error('Places planning requires the acknowledged local mirror.')
  const result = await captureResolvedSqlPlan({
    targets: Object.fromEntries(
      Object.entries(files).flatMap(([binding, path]) => {
        const tables = placeMutationTables(binding)
        return tables.length
          ? [
              [
                binding,
                {
                  path,
                  tables,
                  databaseId:
                    input.context.state.bindings[binding]?.databaseId ?? binding,
                  schema:
                    binding === 'DB_CURRENT'
                      ? currentSchema
                      : binding.startsWith('DB_HISTORY_')
                        ? historySchema
                        : sourceSchema,
                },
              ],
            ]
          : []
      }),
    ),
    publicationTables: ['placePublicationState'],
    append: input.capture,
    generate: async candidates => {
      const current = candidates.DB_CURRENT!
      const target = (binding: string, name: 'current' | 'history' | 'source') => ({
        databaseId: binding,
        name,
      })
      const historyTargets = input.context.historyTargets.map(value => ({
        ...value,
        db: candidates[value.bindingName]!.drizzle,
      }))
      const sourceTargets = input.context.sourceTargets.map(value => ({
        ...value,
        db: candidates[value.bindingName]!.drizzle,
      }))
      const previous = current.db
        .query<
          { snapshotId: string; publicationToken: string; preparedAt: string | null },
          [string]
        >(
          'SELECT snapshotId, publicationToken, preparedAt FROM placePublicationState WHERE scopeId=?',
        )
        .get(input.sqlInput.snapshots.snapshotLineageId)
      if (previous && !previous.preparedAt)
        throw new Error('Places predecessor is incomplete; resume its sealed delivery.')
      const referenceScopes = new Map<string, string>()
      for (const table of ['addressPublicationState', 'divisionPublicationState'])
        for (const row of current.db
          .query<{ snapshotId: string; scopeId: string }, []>(
            `SELECT snapshotId,scopeId FROM ${table} WHERE preparedAt IS NOT NULL AND publicationToken <> ''`,
          )
          .all())
          referenceScopes.set(row.snapshotId, row.scopeId)
      const sqlInput: BuildPlaceSqlInput = {
        ...input.sqlInput,
        publicationPrevious: previous,
        referenceScopes,
        historyRows: await loadCurrentPlaceHistory(historyTargets, {
          currentDb: current.drizzle as unknown as HarbourReadableDb,
          scopeId: input.sqlInput.snapshots.snapshotLineageId,
          replayPlan: previous
            ? await resolveSnapshotReplayPlan(
                input.context.metaDb as unknown as HarbourReadableDb,
                previous.snapshotId,
              )
            : [],
        }),
        sourceRows: await loadCurrentPlaceSources(sourceTargets),
        sourceResolutions: await loadPreviousPlaceSourceResolutions(
          input.context.metaDb as unknown as HarbourReadableDb,
          historyTargets,
          previous?.snapshotId,
        ),
      }
      await importPlaceSqlBatches(
        {
          current: target('DB_CURRENT', 'current'),
          history: target(sqlInput.activeHistoryBindingName, 'history'),
          source: target(sqlInput.activeSourceBindingName, 'source'),
          historyByBinding: new Map(
            historyTargets.map(value => [
              value.bindingName,
              target(value.bindingName, 'history'),
            ]),
          ),
          sourceByBinding: new Map(
            sourceTargets.map(value => [
              value.bindingName,
              target(value.bindingName, 'source'),
            ]),
          ),
        } as Parameters<typeof importPlaceSqlBatches>[0],
        sqlInput,
        input.path,
        input.totalRows,
        input.timestamp,
        {
          isLocal: false,
          captureSql: async (destination, bytes) => {
            const candidate = destination.databaseId
              ? candidates[destination.databaseId]
              : undefined
            if (!candidate) throw new Error('Places SQL resolved an unowned target.')
            candidate.execute(bytes)
          },
        },
        input.onProgress,
      )
      await validateResolvedPlaces(
        current.db,
        input.path,
        sqlInput.snapshots.snapshotLineageId,
        input.totalRows,
      )
    },
  })
  return { mutationSummary: result.mutationSummary }
}
