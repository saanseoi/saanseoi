import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb } from '@repo/core/db/types'
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
  assertOvertureHongKongDivisionSourceAssumptions,
  buildCanonicalDivisionApiI18n,
  buildDivisionBaseHashInput,
  buildDivisionHierarchyLookup,
  buildOvertureDivisionLocaleProcessingActions,
  buildOvertureHongKongAreaHierarchyProcessingActions,
  buildOvertureHongKongDivisionClassificationProcessingActions,
  createDivisionBranchCounts,
  normaliseDivisionI18nForStorage,
  normaliseDivisionRow,
  parseWkbGeometry,
  resolveDistrictId,
} from '@repo/core/pipeline/services/divisions/division'
import { readDivisionRowsWithFixtures } from '@repo/core/pipeline/services/divisions/divisionFixtures'
import { createDivisionPointGuard } from '@repo/core/pipeline/services/divisions/divisionPoint'
import { createHongKongHierarchyGuard } from '@repo/core/pipeline/services/divisions/hongKongHierarchyGuard'
import {
  buildChurnCounts,
  buildChurnStatsRows,
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  buildQualityCounts,
  buildQualityStatsRows,
  createLocaleStatsAccumulator,
  hasLocaleRegression,
  hasNameRegression,
  updateLocaleStatsAccumulator,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import { assertPublishedSnapshotMaterialised } from '@repo/core/pipeline/services/publication/execute.ts'
import { loadLandsdSourceStats } from '@repo/core/pipeline/services/sources/landsdSourceStats'
import { recordContent } from '@repo/core/pipeline/services/sources/recordContent'
import { buildSaanseoiDivisionSourceStats } from '@repo/core/pipeline/services/sources/saanseoiDivisionSourceStats'
import { buildSourceChurnCounts } from '@repo/core/pipeline/services/sources/sourceChurn'
import {
  nativeSourcePayloadHashInput,
  overtureSourcePayload,
  saanseoiSourcePayload,
} from '@repo/core/pipeline/services/sources/sourcePayload'
import { createHash } from '@repo/core/pipeline/utils'
import type { ReleaseProcessingAction } from '@repo/core/provenance/processingAction'
import type { MetaDatabase } from '@repo/db'
import { metaDivisionCodes } from '@repo/db'
import { stringifyGeoJson } from '@repo/db/geoJsonSerialisation'
import { curationDocumentsFor } from '../../curationDocuments'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import { DIVISION_BATCH_SIZE } from './processLocalDivisionSqlUploadConfig.ts'
import { loadNativeAdministrativeHierarchy } from './nativeAdministrativeHierarchyInputs'
import type { NativeAdministrativeHierarchy } from './nativeAdministrativeHierarchy'
import {
  buildDivisionTranslationProcessingActions,
  divisionAuditParents,
  mergeDivisionI18nTranslations,
  resolveDivisionNameTranslations,
} from './processLocalDivisionSqlUploadTranslations.ts'
import type {
  DivisionPreparedRecord,
  DivisionSqlState,
  OwnedCurrentSourceRecord,
  OwnedDivisionVersionSnapshot,
} from './processLocalDivisionSqlUploadTypes.ts'

export async function assertDivisionCurrentSnapshotComplete(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  currentRows: Map<string, DivisionVersionSnapshot>,
  parentSnapshotId: string | null,
  scopeId = parentSnapshotId,
) {
  if (!parentSnapshotId || !scopeId) return
  await assertPublishedSnapshotMaterialised(
    currentDb as unknown as HarbourReadableDb,
    'divisionPublicationState',
    parentSnapshotId,
  )

  const traceDivisionIds = resolveDivisionTraceIds()
  const [activeSnapshotRowCount, activeSnapshotI18nRowCount] = await Promise.all([
    countDivisionCurrentSnapshotRows(currentDb as never, scopeId),
    countDivisionCurrentSnapshotI18nRows(currentDb as never, scopeId),
  ])
  const expectedI18nRowCount = [...currentRows.values()].reduce(
    (total, row) => total + row.localisedRows.length,
    0,
  )

  const traceState = await getDivisionCurrentSnapshotTraceState(
    currentDb as never,
    scopeId,
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

  if (activeSnapshotRowCount !== currentRows.size) {
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

  if (activeSnapshotI18nRowCount !== expectedI18nRowCount) {
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
  nativeRows?: Record<string, unknown>[],
  supplementalRows: Record<string, unknown>[] = [],
  administrativeHierarchy?: NativeAdministrativeHierarchy,
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
  const pointGuard = createDivisionPointGuard()
  const records: DivisionPreparedRecord[] = []
  const inferAdministrativeHierarchy =
    administrativeHierarchy ??
    (message.source === 'hkgov-landsd' ||
    message.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
      ? await loadNativeAdministrativeHierarchy()
      : undefined)
  const seenIds = new Set<string>()
  const isInitialSourceLoad = currentSourceRows.size === 0
  const file = nativeRows
    ? { rows: nativeRows }
    : await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  if (message.source === 'overture' && message.regionCode === 'hk' && !('rows' in file))
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
    supplementalRows,
  )

  for (const [id, translated] of translationsByDivisionId) {
    const entry = hierarchyLookup.get(id)
    if (entry)
      hierarchyLookup.set(id, {
        ...entry,
        i18n: {
          ...entry.i18n,
          ...Object.fromEntries(
            translated.localisations.map(row => [row.locale, { name: row.name }]),
          ),
        },
      })
  }

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
  } of readDivisionRowsWithFixtures(
    file,
    message,
    DIVISION_BATCH_SIZE,
    supplementalRows,
  )) {
    processingActions.push(...fixtureActions)
    for (const row of batch) {
      const raw = row as Record<string, unknown>
      const normalised = normaliseDivisionRow(raw, {
        nativeSourceEvidence: message.source === 'overture' && !isSupplemental,
        deferHierarchyGuard: replacedDivisionIds.has(String(raw.id)),
        hierarchyLookup,
        source: message,
        branchCounts,
        hierarchyGuard,
        pointGuard,
      })
      if (
        inferAdministrativeHierarchy &&
        ['housing-market-area', 'settlement'].includes(normalised.base.class)
      ) {
        const shape =
          typeof raw.geometry === 'string' && raw.geometry.trim().startsWith('{')
            ? JSON.parse(raw.geometry)
            : parseWkbGeometry(raw.geometry)
        const inferred = inferAdministrativeHierarchy(normalised.base.id, shape)
        normalised.base.hierarchies = inferred.hierarchies
        processingActions.push(inferred.action)
      }
      if (normalised.overtureHongKongDivisionClassificationCorrection)
        processingActions.push(
          ...buildOvertureHongKongDivisionClassificationProcessingActions(
            normalised.base.id,
          ),
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
          resolvedI18n!.localisations,
          resolvedI18n!.applications,
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
          translations: resolvedI18n!.applications,
          parents: divisionAuditParents(normalised.base.hierarchies),
        }),
      )
      const storedCanonicalI18n = normaliseDivisionI18nForStorage(canonicalI18n)
      const versionHash = await createHash(buildDivisionBaseHashInput(normalised.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalised.base),
        i18n: storedCanonicalI18n,
      })
      const sourcePayloadHash = await createHash(
        message.source === 'saanseoi'
          ? nativeSourcePayloadHashInput(saanseoiSourcePayload(raw))
          : recordContent(raw),
      )
      const current = currentRows.get(normalised.base.id)
      const currentChanged = current?.churnHash !== churnHash
      const baseChanged = current?.versionHash !== versionHash
      const i18nVersionHash =
        !baseChanged && currentChanged
          ? await createHash({
              baseVersionHash: versionHash,
              i18n: storedCanonicalI18n.map(localised => ({
                locale: localised.locale,
                name: localised.name ?? null,
                nameAlts: localised.nameAlts ?? null,
                nameRules: localised.nameRules,
                nameVariant: localised.nameVariant,
                meta: localised.meta,
              })),
              kind: 'division-i18n',
            })
          : versionHash
      const currentSource = currentSourceRows.get(normalised.base.id) ?? null
      const sourceChanged =
        !isSupplemental && currentSource?.sourcePayloadHash !== sourcePayloadHash

      if (sourceChanged) {
        sourceChangedRows += 1
      } else if (currentSource && !isSupplemental) {
        sourceUnchangedRows += 1
      }

      processedRows += 1
      localisedRows += storedCanonicalI18n.length
      seenIds.add(normalised.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        storedCanonicalI18n.map(localised => ({
          hasAltName: Boolean(localised.nameAlts),
          hasName: Boolean(localised.name),
          locale: localised.locale,
          meta: localised.meta,
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
        parentId: resolveParentDivisionIdFromHierarchy(normalised.base.hierarchies),
        type: normalised.base.class,
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

  const classCounts = new Map<string, number>()
  for (const record of processedRowsById.values())
    classCounts.set(record.type, (classCounts.get(record.type) ?? 0) + 1)
  const statsRows =
    message.source === 'saanseoi'
      ? [
          ...buildLocaleStatsRows(statsAccumulator),
          ...buildQualityStatsRows(
            buildQualityCounts(previousRows, processedRowsById, {
              hasLocaleRegression,
              hasNameRegression,
            }),
          ),
          ...buildSaanseoiDivisionSourceStats(
            new Map(
              [...currentSourceRows].map(([id, row]) => [
                id,
                {
                  properties: row.properties,
                  sourceGeometry: row.sourceGeometry,
                },
              ]),
            ),
            new Map(
              records
                .filter(record => !record.isSupplemental)
                .map(record => [
                  record.id,
                  !record.sourceChanged && currentSourceRows.has(record.id)
                    ? {
                        properties: currentSourceRows.get(record.id)!.properties,
                        sourceGeometry: currentSourceRows.get(record.id)!
                          .sourceGeometry,
                      }
                    : saanseoiSourcePayload(record.raw),
                ]),
            ),
          ),
        ]
      : message.source === 'hkgov-landsd'
        ? await loadLandsdSourceStats(
            sourceDatabases,
            metaDb as unknown as HarbourReadableDb,
            message.resourceReleaseId ?? message.datasetId,
            message.sourceVersion,
          )
        : [
            ...buildLocaleStatsRows(statsAccumulator),
            ...buildDistrictDistributionStatsRows(districtCounts),
            ...[...classCounts]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([type, value]) => ({
                category: 'records',
                measure: 'count',
                unit: 'count',
                value,
                dimension: 'type',
                dimensionValue: type,
                createdAt: new Date().toISOString(),
              })),
            ...buildChurnStatsRows(
              message.source === 'overture'
                ? buildSourceChurnCounts(
                    new Map(
                      [...currentSourceRows].map(([id, row]) => [
                        id,
                        {
                          properties: row.properties,
                          sourceGeometry: row.sourceGeometry,
                        },
                      ]),
                    ),
                    new Map(
                      records
                        .filter(record => !record.isSupplemental)
                        .map(record => [
                          record.id,
                          !record.sourceChanged && currentSourceRows.has(record.id)
                            ? {
                                properties: currentSourceRows.get(record.id)!
                                  .properties,
                                sourceGeometry: currentSourceRows.get(record.id)!
                                  .sourceGeometry,
                              }
                            : overtureSourcePayload(record.raw),
                        ]),
                    ),
                  )
                : buildChurnCounts(previousRows, processedRowsById),
            ),
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
      ...pointGuard.snapshot(),
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
  return value === null || value === undefined ? null : stringifyGeoJson(value)
}

export function resolveParentDivisionIdFromHierarchy(
  hierarchy: unknown,
): string | null {
  const paths = (hierarchy as import('@repo/db').DivisionHierarchies | null)?.full ?? []
  const ids = [...new Set(paths.flatMap(path => path.at(-1)?.id ?? []))].sort()
  return ids.length === 1 ? (ids[0] ?? null) : ids.length ? JSON.stringify(ids) : null
}

export function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function sourceString(value: unknown) {
  return typeof value === 'string' ? value : null
}
