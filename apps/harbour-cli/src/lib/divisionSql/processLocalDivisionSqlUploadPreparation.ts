import type { DatasetProcessingMessage } from '@repo/core'
import { landsdPlaceNameResolutions } from '@repo/core/pipeline/db/landsdPlaceNameSources'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { createHongKongHierarchyGuard } from '@repo/core/pipeline/services/hongKongHierarchyGuard'
import { curationDocumentsFor } from '../curationDocuments'
import {
  hasLocaleRegression,
  hasNameRegression,
} from '@repo/core/pipeline/services/stats'
import { metaDivisionCodes } from '@repo/db'
import type { MetaDatabase } from '@repo/db'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { createDivisionBranchCounts } from '@repo/core/pipeline/services/division'
import type { DivisionVersionSnapshot } from '@repo/core/pipeline/db/division'
import {
  countDivisionCurrentSnapshotI18nRows,
  countDivisionCurrentSnapshotRows,
  getDivisionCurrentSnapshotTraceState,
} from '@repo/core/pipeline/db/division'
import {
  logDivisionTrace,
  logDivisionTraceGroup,
  resolveDivisionTraceIds,
} from '@repo/core/pipeline/logging'
import { createAsyncBufferFromR2 } from '@repo/core/pipeline/parquetR2'
import {
  buildCanonicalDivisionApiI18n,
  buildDivisionBaseHashInput,
  buildDivisionHierarchyLookup,
  assertOvertureHongKongDivisionSourceAssumptions,
  buildOvertureHongKongAreaHierarchyProcessingActions,
  buildOvertureHongKongDivisionClassificationProcessingActions,
  buildOvertureDivisionLocaleProcessingActions,
  normaliseDivisionRow,
  normaliseDivisionI18nForStorage,
  resolveDistrictId,
} from '@repo/core/pipeline/services/division'
import { readDivisionRowsWithFixtures } from '@repo/core/pipeline/services/divisionFixtures'
import {
  buildChurnCounts,
  buildChurnStatsRows,
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  buildQualityCounts,
  buildQualityStatsRows,
  createLocaleStatsAccumulator,
  updateLocaleStatsAccumulator,
} from '@repo/core/pipeline/services/stats'
import { createHash } from '@repo/core/pipeline/utils'
import type { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import type { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import type {
  DivisionPreparedRecord,
  DivisionSqlState,
  OwnedCurrentSourceRecord,
  OwnedDivisionVersionSnapshot,
} from './processLocalDivisionSqlUploadTypes.ts'
import {
  buildDivisionTranslationProcessingActions,
  divisionAuditParents,
  mergeDivisionI18nTranslations,
  resolveDivisionNameTranslations,
} from './processLocalDivisionSqlUploadTranslations.ts'
import { DIVISION_BATCH_SIZE } from './processLocalDivisionSqlUploadConfig.ts'

export async function assertDivisionCurrentSnapshotComplete(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  currentRows: Map<string, DivisionVersionSnapshot>,
  parentSnapshotId: string | null,
) {
  if (!parentSnapshotId) return

  const traceDivisionIds = resolveDivisionTraceIds()
  const [activeSnapshotRowCount, activeSnapshotI18nRowCount] = await Promise.all([
    countDivisionCurrentSnapshotRows(currentDb as never, parentSnapshotId),
    countDivisionCurrentSnapshotI18nRows(currentDb as never, parentSnapshotId),
  ])
  const expectedI18nRowCount = [...currentRows.values()].reduce(
    (total, row) => total + row.localisedRows.length,
    0,
  )

  const traceState = await getDivisionCurrentSnapshotTraceState(
    currentDb as never,
    parentSnapshotId,
    [...traceDivisionIds],
  )

  for (const divisionId of traceDivisionIds) {
    const snapshotState = traceState.get(divisionId)

    logDivisionTrace(traceDivisionIds, divisionId, {
      activeSnapshotCode: parentSnapshotId,
      activeSnapshotId: parentSnapshotId,
      event: 'baseline',
      historyCurrentExists: currentRows.has(divisionId),
      historyCurrentLocaleCount: currentRows.get(divisionId)?.localisedRows.length ?? 0,
      phase: 'assertDivisionCurrentSnapshotComplete',
      snapshotI18nRowCount: snapshotState?.i18nRowCount ?? 0,
      snapshotRowExists: snapshotState?.isPresent ?? false,
    })
  }

  if (currentRows.size > 0 && activeSnapshotRowCount !== currentRows.size) {
    for (const divisionId of traceDivisionIds) {
      const snapshotState = traceState.get(divisionId)

      logDivisionTrace(traceDivisionIds, divisionId, {
        activeSnapshotCode: parentSnapshotId,
        activeSnapshotId: parentSnapshotId,
        event: 'activeSnapshotMismatch',
        historyCurrentExists: currentRows.has(divisionId),
        historyCurrentLocaleCount:
          currentRows.get(divisionId)?.localisedRows.length ?? 0,
        phase: 'assertDivisionCurrentSnapshotComplete',
        snapshotI18nRowCount: snapshotState?.i18nRowCount ?? 0,
        snapshotRowExists: snapshotState?.isPresent ?? false,
      })
    }

    throw new Error(
      `Parent division snapshot ${parentSnapshotId} is incomplete in current storage: expected ${currentRows.size} rows, found ${activeSnapshotRowCount}.`,
    )
  }

  if (expectedI18nRowCount > 0 && activeSnapshotI18nRowCount !== expectedI18nRowCount) {
    throw new Error(
      `Parent division snapshot ${parentSnapshotId} is incomplete in current i18n storage: expected ${expectedI18nRowCount} rows, found ${activeSnapshotI18nRowCount}.`,
    )
  }
}

export async function buildDivisionSqlState(
  bucket: LocalPipelineBucket,
  message: DatasetProcessingMessage,
  metaDb: MetaDatabase,
  currentRows: Map<string, OwnedDivisionVersionSnapshot>,
  currentSourceRows: Map<string, OwnedCurrentSourceRecord>,
  snapshotId: string,
  allowTranslationGeneration: boolean,
  reportProgress: (current: number) => Promise<void>,
  sourceDatabases: readonly HarbourReadableDb[] = [],
) {
  const traceDivisionIds = resolveDivisionTraceIds()
  const previousRows = new Map(currentRows)
  const processedRowsById = new Map<string, DivisionVersionSnapshot>()
  const statsAccumulator = createLocaleStatsAccumulator()
  const districtCounts = new Map<string, number>()
  const hongKongAreaHierarchyAssignmentCounts = new Map<string, number>()
  const processingActions: ReleaseProcessingAction[] = []
  const branchCounts = createDivisionBranchCounts()
  const hierarchyGuard = createHongKongHierarchyGuard()
  const records: DivisionPreparedRecord[] = []
  const seenIds = new Set<string>()
  const isInitialSourceLoad = currentSourceRows.size === 0
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  if (message.source === 'overture' && message.regionCode === 'hk')
    await assertOvertureHongKongDivisionSourceAssumptions(file)
  const hierarchyLookup = await buildDivisionHierarchyLookup(file, message)
  const sourceRelease = message.releaseCode
  if (!sourceRelease) {
    throw new Error('Division i18n fixtures require a source release code.')
  }
  const divisionCodeAssignments =
    message.source === 'overture'
      ? await loadDivisionCodeAssignments(metaDb)
      : new Map<string, string>()
  const translationsByDivisionId = await resolveDivisionNameTranslations(
    file,
    message,
    hierarchyLookup,
    sourceRelease,
    allowTranslationGeneration,
  )

  let processedRows = 0
  let insertedVersions = 0
  let localisedRows = 0
  let sourceChangedRows = 0
  let sourceUnchangedRows = 0
  let unchangedRows = 0

  for (const divisionId of traceDivisionIds) {
    logDivisionTrace(traceDivisionIds, divisionId, {
      event: 'baseline',
      historyCurrentExists: currentRows.has(divisionId),
      historyCurrentLocaleCount: currentRows.get(divisionId)?.localisedRows.length ?? 0,
      phase: 'buildDivisionSqlState',
      snapshotId,
      sourceCurrentExists: currentSourceRows.has(divisionId),
      sourceVersion: message.sourceVersion,
    })
  }

  for await (const {
    isSupplemental,
    replacedDivisionIds,
    rows: batch,
    processingActions: fixtureActions,
  } of readDivisionRowsWithFixtures(file, message, DIVISION_BATCH_SIZE)) {
    processingActions.push(...fixtureActions)
    for (const row of batch) {
      const raw = row as Record<string, unknown>
      const normalised = normaliseDivisionRow(raw, {
        deferHierarchyGuard: replacedDivisionIds.has(String(raw.id)),
        hierarchyLookup,
        source: message,
        branchCounts,
        hierarchyGuard,
      })
      if (normalised.overtureHongKongDivisionClassificationCorrection)
        processingActions.push(
          ...buildOvertureHongKongDivisionClassificationProcessingActions(1),
        )
      if (normalised.overtureHongKongAreaHierarchyAssignment) {
        const { code } = normalised.overtureHongKongAreaHierarchyAssignment
        hongKongAreaHierarchyAssignmentCounts.set(
          code,
          (hongKongAreaHierarchyAssignmentCounts.get(code) ?? 0) + 1,
        )
      }
      if (message.source === 'overture') {
        Object.assign(normalised.base, {
          divisionCode:
            divisionCodeAssignments.get(`geographic\u0000${normalised.base.id}`) ??
            null,
        })
      }
      const resolvedI18n = translationsByDivisionId.get(normalised.base.id)
      if (!resolvedI18n) {
        throw new Error(
          `Missing source-release i18n result for ${sourceRelease}/${normalised.base.id}.`,
        )
      }
      const canonicalI18n = buildCanonicalDivisionApiI18n(
        mergeDivisionI18nTranslations(
          normalised.i18n,
          resolvedI18n.localisations,
          resolvedI18n.applications,
        ),
        branchCounts,
      )
      if (message.source === 'overture') {
        processingActions.push(
          ...buildOvertureDivisionLocaleProcessingActions({
            canonicalI18n,
            division: normalised.base,
            rawNames: raw.names,
            sourceI18n: normalised.i18n,
          }),
        )
      }
      processingActions.push(
        ...buildDivisionTranslationProcessingActions({
          division: normalised.base,
          rawNames: normalised.i18n.map(row => row.name),
          translations: resolvedI18n.applications,
          parents: divisionAuditParents(normalised.base.hierarchy),
        }),
      )
      const storedCanonicalI18n = normaliseDivisionI18nForStorage(canonicalI18n)
      const versionHash = await createHash(buildDivisionBaseHashInput(normalised.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalised.base),
        i18n: storedCanonicalI18n,
      })
      const sourcePayloadHash = await createHash(raw)
      const current = currentRows.get(normalised.base.id)
      const currentChanged = current?.churnHash !== churnHash
      const baseChanged = current?.versionHash !== versionHash
      const i18nVersionHash =
        !baseChanged && currentChanged
          ? await createHash({
              baseVersionHash: versionHash,
              i18n: storedCanonicalI18n.map(localised => ({
                isLocaleInferred: localised.isLocaleInferred,
                nameProvenance: localised.nameProvenance,
                locale: localised.locale,
                name: localised.name ?? null,
                nameAlts: localised.nameAlts ?? null,
                nameRules: localised.nameRules,
                nameVariant: localised.nameVariant,
              })),
              kind: 'division-i18n',
            })
          : versionHash
      const currentSource = currentSourceRows.get(normalised.base.id) ?? null
      const sourceChanged =
        !isSupplemental && currentSource?.sourcePayloadHash !== sourcePayloadHash

      processedRows += 1
      localisedRows += storedCanonicalI18n.length
      seenIds.add(normalised.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        storedCanonicalI18n.map(localised => ({
          hasAltName: Boolean(localised.nameAlts),
          hasName: Boolean(localised.name),
          isLocaleInferred: localised.isLocaleInferred,
          nameProvenance: localised.nameProvenance,
          locale: localised.locale,
        })),
      )
      const districtId = resolveDistrictId(normalised.base)
      if (districtId) {
        districtCounts.set(districtId, (districtCounts.get(districtId) ?? 0) + 1)
      }
      processedRowsById.set(normalised.base.id, {
        churnHash,
        geometry: normalised.base.geometry,
        id: normalised.base.id,
        localisedRows: storedCanonicalI18n,
        parentId: resolveParentDivisionIdFromHierarchy(normalised.base.hierarchy),
        type: normalised.base.type,
        versionHash,
      })

      logDivisionTrace(traceDivisionIds, normalised.base.id, {
        baseChanged,
        currentChanged,
        currentExists: Boolean(current),
        event: 'rowSeen',
        historyCurrentLocaleCount: current?.localisedRows.length ?? 0,
        localeCount: storedCanonicalI18n.length,
        phase: 'buildDivisionSqlState',
        sourceChanged,
        sourceCurrentExists: Boolean(currentSource),
        sourceVersion: message.sourceVersion,
      })

      if (sourceChanged) {
        sourceChangedRows += 1
      } else if (currentSource && !isSupplemental) {
        sourceUnchangedRows += 1
      }

      if (!currentChanged) {
        unchangedRows += 1
      } else if (baseChanged) {
        insertedVersions += 1
      }

      records.push({
        base: normalised.base,
        baseChanged,
        canonicalI18n: storedCanonicalI18n,
        currentChanged,
        currentExists: Boolean(current),
        id: normalised.base.id,
        i18nVersionHash,
        isSupplemental,
        raw,
        sourceChanged,
        sourcePayloadHash,
        versionHash,
      })
    }

    if (!isSupplemental) {
      await reportProgress(processedRows)
    }
  }

  if (message.source === 'hkgov-landsd') {
    const resolutions = await landsdPlaceNameResolutions(
      sourceDatabases,
      message.sourceVersion,
      snapshotId,
      records,
      message.releaseId ?? message.datasetId,
    )
    for (const [index, resolution] of resolutions.entries())
      records[index]!.sourceResolution = resolution
  }

  logDivisionTraceGroup(
    traceDivisionIds,
    [...currentRows.keys()].filter(id => !seenIds.has(id)),
    {
      event: 'missingFromDataset',
      phase: 'buildDivisionSqlState',
      snapshotId,
      sourceVersion: message.sourceVersion,
    },
  )

  const statsRows = [
    ...buildLocaleStatsRows(statsAccumulator),
    ...buildDistrictDistributionStatsRows(districtCounts),
    ...buildChurnStatsRows(buildChurnCounts(previousRows, processedRowsById)),
    ...buildQualityStatsRows(
      buildQualityCounts(previousRows, processedRowsById, {
        hasLocaleRegression,
        hasNameRegression,
      }),
    ),
  ]
  processingActions.push(
    ...buildOvertureHongKongAreaHierarchyProcessingActions(
      hongKongAreaHierarchyAssignmentCounts,
    ),
  )

  return {
    currentRows,
    curationDocuments: curationDocumentsFor(translationsByDivisionId),
    auditGuards: [
      hierarchyGuard,
      {
        id: 'division-source-identities',
        summary: 'Require non-empty, unique source division identities.',
        consequence: 'block-ingestion',
        status: 'passed',
        checked: hierarchyLookup.size,
        failed: 0,
        reason: 'All source division identities are present and unique.',
      },
      ...(message.source === 'overture' && message.regionCode === 'hk'
        ? [
            {
              id: 'overture-division-source-assumptions',
              summary:
                'Verify the registered assumptions for dropped Overture source fields.',
              consequence: 'block-ingestion' as const,
              status: 'passed' as const,
              checked: 1,
              failed: 0,
              reason: 'The source satisfies the dropped-field assumptions.',
            },
          ]
        : []),
    ],
    currentSourceRows,
    deletedRows: [...currentRows.keys()].filter(id => !seenIds.has(id)).length,
    insertedVersions,
    isInitialSourceLoad,
    localisedRows,
    previousRows,
    processedRows,
    processedRowsById,
    processingActions,
    branchCounts,
    records,
    seenIds,
    snapshotId,
    sourceChangedRows,
    sourceUnchangedRows,
    statsRows,
    unchangedRows,
  } satisfies DivisionSqlState
}

async function loadDivisionCodeAssignments(metaDb: MetaDatabase) {
  const rows = await metaDb
    .select({
      canonicalId: metaDivisionCodes.canonicalId,
      divisionCode: metaDivisionCodes.divisionCode,
      domainCode: metaDivisionCodes.domainCode,
    })
    .from(metaDivisionCodes)
    .all()

  return new Map(
    rows.map(row => [`${row.domainCode}\u0000${row.canonicalId}`, row.divisionCode]),
  )
}

export async function processDivisionRecordBatches(
  records: DivisionPreparedRecord[],
  reportProgress: (current: number) => Promise<void>,
  worker: (batch: DivisionPreparedRecord[]) => void | Promise<void>,
) {
  for (let index = 0; index < records.length; index += DIVISION_BATCH_SIZE) {
    const batch = records.slice(index, index + DIVISION_BATCH_SIZE)

    await worker(batch)
    await reportProgress(Math.min(index + batch.length, records.length))
  }
}

export function jsonText(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

export function resolveParentDivisionIdFromHierarchy(
  hierarchy: unknown,
): string | null {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return null
  }

  const parent = hierarchy[hierarchy.length - 1]
  if (!parent || typeof parent !== 'object') {
    return null
  }

  const divisionId = (parent as Record<string, unknown>).division_id
  return typeof divisionId === 'string' && divisionId.trim().length > 0
    ? divisionId
    : null
}

export function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function sourceString(value: unknown) {
  return typeof value === 'string' ? value : null
}
