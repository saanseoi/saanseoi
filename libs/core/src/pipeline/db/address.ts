import { snapshotEventProducer } from './snapshotReplay'
import { currentSchema, getTableColumns, historySchema } from '@repo/db'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'
import type { CurrentAddressVersionRow } from '@repo/db/historySchema'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssembly,
  resolveShardForTypeRegionYear,
  resolveSnapshotReplayPlan,
  type SnapshotReplayStep,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import type { DatasetProcessingMessage } from '../../types'
import { buildAddressBuildingNumberLookupRows } from '../services/addresses/normalisation'
import { resolveStatisticEvents } from '../services/statistics/statisticSnapshotRecords'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runWithWriteRetry,
} from '../utils'
import {
  type ReplayShard,
  type ResolvedSnapshotVersion,
  resolveSnapshotVersionState,
} from './snapshotReplay'

const CURRENT_ADDRESS2D_COLUMN_COUNT = Object.keys(
  getTableColumns(currentSchema.address2d),
).length
const CURRENT_ADDRESS2D_I18N_COLUMN_COUNT = Object.keys(
  getTableColumns(currentSchema.address2dI18n),
).length
const CURRENT_ADDRESS2D_BUILDING_LOOKUP_COLUMN_COUNT = Object.keys(
  getTableColumns(currentSchema.address2dBuildingNumberLookup),
).length
const HISTORY_ADDRESS2D_VERSION_COLUMN_COUNT = Object.keys(
  getTableColumns(historySchema.address2d),
).length
const HISTORY_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = Object.keys(
  getTableColumns(historySchema.address2dI18n),
).length
const HISTORY_ADDRESS2D_BUILDING_LOOKUP_VERSION_COLUMN_COUNT = Object.keys(
  getTableColumns(historySchema.address2dBuildingNumberLookup),
).length
const HISTORY_ADDRESS2D_VERSION_UPSERT_FIXED_VARIABLE_COUNT = 7
const _SEEN_ADDRESS_ID_INSERT_COLUMN_COUNT = 1
const ADDRESS_DIVISION_REFERENCE_COLUMNS = [
  'countryId',
  'landformId',
  'areaId',
  'districtId',
  'townId',
  'ruralAreaId',
  'macrohoodId',
  'villageId',
  'neighbourhoodId',
  'hamletId',
  'microhoodId',
] as const

const _tempSeenAddressIds = sqliteTable('tempSeenAddressIds', {
  id: text('id').primaryKey(),
})

export type AddressBaseRecord = AddressRow
export type AddressI18nRecord = NewAddressI18nRow

export type AddressVersionSnapshot = {
  churnHash: string
  id: string
  localisedRows: AddressI18nPayload[]
  matchKey: string | null
  versionHash: string
}

export type AddressCurrentMatchInput = {
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  districtId: string | null
  streetName: string | null
}

export type CurrentAddressVersionLookupResult = {
  byId: Map<string, AddressVersionSnapshot>
  byMatchKey: Map<string, AddressVersionSnapshot>
}

/**
 * An address version selected by replaying an immutable snapshot branch. Unlike
 * `isCurrent`, this identifies the version which belonged to one specific
 * historical snapshot.
 */
export type ReplayedAddressVersionSnapshot = AddressVersionSnapshot & {
  base: Omit<CurrentAddressVersionLookupRow, 'versionHash'>
}

type AddressVersionLookupOptions = {
  buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
  buildMatchKey: (input: AddressCurrentMatchInput) => string | null
  normaliseAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
}

type AddressHashInput = Omit<
  AddressRow,
  'scopeId' | 'createdAt' | 'updatedAt' | 'divisionSnapshotId' | 'streetSnapshotId'
>

type CurrentAddressVersionLookupRow = Pick<
  CurrentAddressVersionRow,
  | 'parentAddressId'
  | 'granularity'
  | 'landformId'
  | 'areaId'
  | 'countryId'
  | 'createdAt'
  | 'districtId'
  | 'geometry'
  | 'hamletId'
  | 'id'
  | 'identifiers'
  | 'ruralAreaId'
  | 'macrohoodId'
  | 'microhoodId'
  | 'neighbourhoodId'
  | 'sources'
  | 'streetId'
  | 'townId'
  | 'versionHash'
  | 'villageId'
>

export type AddressVersionInsertContext = {
  resourceReleaseId: string
  releaseRole: 'primary' | 'enrichment'
  snapshotId: string
  cohortKey: string
  parentSnapshotId: string | null
  snapshotLineageId: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

type RawSqlWritableDb = {
  run(statement: unknown): unknown | Promise<unknown>
}

function runRawSql(db: HarbourWritableDb, statement: unknown) {
  return runWithWriteRetry(() => (db as unknown as RawSqlWritableDb).run(statement))
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function buildAlignAddressCurrentDivisionSnapshotSql(
  snapshotId: string,
  divisionSnapshotId: string,
) {
  const assignments = ADDRESS_DIVISION_REFERENCE_COLUMNS.map(
    column => `  ${column} = CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM divisions
      WHERE divisions.scopeId = ${sqlLiteral(divisionSnapshotId)}
        AND divisions.id = address2d.${column}
    ) THEN ${column}
    ELSE NULL
  END`,
  )

  return `
UPDATE address2d
SET
  divisionSnapshotId = ${sqlLiteral(divisionSnapshotId)},
${assignments.join(',\n')}
WHERE scopeId = ${sqlLiteral(snapshotId)}
  AND divisionSnapshotId IS NOT ${sqlLiteral(divisionSnapshotId)};
`.trim()
}

function selectCurrentAddressVersionFields() {
  return {
    id: historySchema.address2d.id,
    parentAddressId: historySchema.address2d.parentAddressId,
    granularity: historySchema.address2d.granularity,
    streetId: historySchema.address2d.streetId,
    hamletId: historySchema.address2d.hamletId,
    microhoodId: historySchema.address2d.microhoodId,
    villageId: historySchema.address2d.villageId,
    neighbourhoodId: historySchema.address2d.neighbourhoodId,
    ruralAreaId: historySchema.address2d.ruralAreaId,
    macrohoodId: historySchema.address2d.macrohoodId,
    townId: historySchema.address2d.townId,
    districtId: historySchema.address2d.districtId,
    landformId: historySchema.address2d.landformId,
    areaId: historySchema.address2d.areaId,
    countryId: historySchema.address2d.countryId,
    createdAt: historySchema.address2d.createdAt,
    geometry: historySchema.address2d.geometry,
    identifiers: historySchema.address2d.identifiers,
    sources: historySchema.address2d.sources,
    versionHash: historySchema.address2d.versionHash,
  }
}

function _normaliseAddressMatchToken(value: string | null) {
  const normalised = value?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalised || null
}

function _normaliseAddressSqlMatchToken(value: string) {
  return value.replace(/\s+/g, '')
}

async function buildAddressVersionSnapshotMapFromRows(
  versionRows: CurrentAddressVersionLookupRow[],
  i18nRows: AddressI18nPayload[],
  options: AddressVersionLookupOptions,
) {
  const rows = [...new Map(versionRows.map(row => [row.id, row])).values()]
  const i18nByAddressId = new Map<string, AddressI18nPayload[]>()

  for (const row of i18nRows) {
    const rowsForAddress = i18nByAddressId.get(row.addressId) ?? []
    rowsForAddress.push(row)
    i18nByAddressId.set(row.addressId, rowsForAddress)
  }

  const snapshots: Array<readonly [string, AddressVersionSnapshot]> = []

  for (const row of rows) {
    const localisedRows = [...(i18nByAddressId.get(row.id) ?? [])]
      .map(options.normaliseAddressI18nSnapshotRow)
      .sort((left, right) => left.locale.localeCompare(right.locale))

    snapshots.push([
      row.id,
      {
        churnHash: await createHash({
          base: options.buildAddressBaseHashInput(row),
          i18n: localisedRows,
        }),
        id: row.id,
        localisedRows,
        matchKey: options.buildMatchKey({
          districtId: row.districtId,
          buildingNumberFrom:
            localisedRows.find(localised => localised.locale === 'en')
              ?.buildingNumberFrom ?? null,
          buildingNumberTo:
            localisedRows.find(localised => localised.locale === 'en')
              ?.buildingNumberTo ?? null,
          streetName:
            localisedRows.find(localised => localised.locale === 'en')?.streetName ??
            null,
        }),
        versionHash: row.versionHash,
      } satisfies AddressVersionSnapshot,
    ])
  }

  return new Map(snapshots)
}

/**
 * Reconstructs the exact address state at a historical snapshot. History
 * tables retain inline immutable events; the read-only historyEvents view
 * exposes them for parent-chain membership resolution.
 */
export async function getReplayedAddressVersionMap(
  metaDb: HarbourReadableDb,
  snapshotId: string,
  historyShards: ReadonlyMap<string, ReplayShard>,
  options: AddressVersionLookupOptions,
  selection?: {
    recordIds?: string[]
    includeLocales?: boolean
    plan?: SnapshotReplayStep[]
  },
): Promise<Map<string, ReplayedAddressVersionSnapshot>> {
  const plan = selection?.plan ?? (await resolveSnapshotReplayPlan(metaDb, snapshotId))
  const resolvedVersions = await resolveSnapshotVersionState(
    plan,
    historyShards,
    ['address2d', ...(selection?.includeLocales === false ? [] : ['address2dI18n'])],
    selection?.recordIds,
  )
  const baseVersions = [...resolvedVersions.values()].filter(
    version => version.recordType === 'address2d',
  )
  const i18nVersions = [...resolvedVersions.values()].filter(
    version => version.recordType === 'address2dI18n',
  )
  const baseRows = await loadReplayedAddressBaseRows(baseVersions)
  const i18nRows = await loadReplayedAddressI18nRows(i18nVersions)
  const snapshots = await buildAddressVersionSnapshotMapFromRows(
    baseRows,
    i18nRows,
    options,
  )
  const baseRowsById = new Map(baseRows.map(row => [row.id, row]))

  return new Map(
    [...snapshots].map(([id, snapshot]) => {
      const base = baseRowsById.get(id)
      if (!base) {
        throw new Error(`Snapshot ${snapshotId} is missing address content for ${id}.`)
      }
      const { versionHash: _versionHash, ...baseWithoutVersionHash } = base

      return [id, { ...snapshot, base: baseWithoutVersionHash }]
    }),
  )
}

async function loadReplayedAddressBaseRows(
  versions: ResolvedSnapshotVersion[],
): Promise<CurrentAddressVersionLookupRow[]> {
  const rows: CurrentAddressVersionLookupRow[] = []

  for (const [bindingName, shardVersions] of groupVersionsByBinding(versions)) {
    const expected = new Set(
      shardVersions.map(version => `${version.recordId}\u0000${version.versionHash}`),
    )
    const db = shardVersions[0]?.shard.db
    if (!db) continue

    const found = new Set<string>()
    for (const batch of chunkArray(shardVersions, getMaxItemsPerInClause(4))) {
      const candidates = (await db
        .select(selectCurrentAddressVersionFields())
        .from(historySchema.address2d)
        .where(
          or(
            ...batch.map(version =>
              and(
                eq(historySchema.address2d.id, version.recordId),
                eq(historySchema.address2d.versionHash, version.versionHash),
                eq(historySchema.address2d.snapshotId, version.snapshotId),
              ),
            ),
          ),
        )
        .all()) as CurrentAddressVersionLookupRow[]
      for (const candidate of candidates) {
        const key = `${candidate.id}\u0000${candidate.versionHash}`
        if (!expected.has(key)) continue
        found.add(key)
        rows.push(candidate)
      }
    }

    if (found.size !== expected.size) {
      throw new Error(
        `Snapshot replay could not load address versions from ${bindingName}.`,
      )
    }
  }

  return rows
}

async function loadReplayedAddressI18nRows(
  versions: ResolvedSnapshotVersion[],
): Promise<AddressI18nPayload[]> {
  const rows: AddressI18nPayload[] = []

  for (const [bindingName, shardVersions] of groupVersionsByBinding(versions)) {
    const expected = new Set(
      shardVersions.map(
        version =>
          `${version.recordId}\u0000${version.locale}\u0000${version.versionHash}`,
      ),
    )
    const db = shardVersions[0]?.shard.db
    if (!db) continue

    const found = new Set<string>()
    for (const batch of chunkArray(shardVersions, getMaxItemsPerInClause(4))) {
      const candidates = await db
        .select({
          meta: historySchema.address2dI18n.meta,
          addressId: historySchema.address2dI18n.addressId,
          locale: historySchema.address2dI18n.locale,
          formattedAddress: historySchema.address2dI18n.formattedAddress,
          buildingName: historySchema.address2dI18n.buildingName,
          buildingNumberExpression:
            historySchema.address2dI18n.buildingNumberExpression,
          buildingNumberFrom: historySchema.address2dI18n.buildingNumberFrom,
          buildingNumberTo: historySchema.address2dI18n.buildingNumberTo,
          buildingNumberConnector: historySchema.address2dI18n.buildingNumberConnector,
          blockExpression: historySchema.address2dI18n.blockExpression,
          blockType: historySchema.address2dI18n.blockType,
          blockRef: historySchema.address2dI18n.blockRef,
          blockTypeBeforeNumber: historySchema.address2dI18n.blockTypeBeforeNumber,
          phaseExpression: historySchema.address2dI18n.phaseExpression,
          phaseName: historySchema.address2dI18n.phaseName,
          phaseRef: historySchema.address2dI18n.phaseRef,
          estateName: historySchema.address2dI18n.estateName,
          streetName: historySchema.address2dI18n.streetName,
          versionHash: historySchema.address2dI18n.versionHash,
        })
        .from(historySchema.address2dI18n)
        .where(
          or(
            ...batch.map(version =>
              and(
                eq(historySchema.address2dI18n.addressId, version.recordId),
                eq(historySchema.address2dI18n.versionHash, version.versionHash),
                eq(historySchema.address2dI18n.snapshotId, version.snapshotId),
                eq(historySchema.address2dI18n.locale, version.locale),
              ),
            ),
          ),
        )
        .all()
      for (const candidate of candidates) {
        const key = `${candidate.addressId}\u0000${candidate.locale}\u0000${candidate.versionHash}`
        if (!expected.has(key)) continue
        found.add(key)
        const { versionHash: _versionHash, ...row } = candidate
        rows.push(row)
      }
    }

    if (found.size !== expected.size) {
      throw new Error(
        `Snapshot replay could not load address i18n versions from ${bindingName}.`,
      )
    }
  }

  return rows
}

function groupVersionsByBinding(versions: ResolvedSnapshotVersion[]) {
  const grouped = new Map<string, ResolvedSnapshotVersion[]>()
  for (const version of versions) {
    const existing = grouped.get(version.shard.bindingName)
    if (existing) existing.push(version)
    else grouped.set(version.shard.bindingName, [version])
  }
  return grouped
}

export async function prepareAddressVersionInsertContext(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
  options: { deferAssembly?: boolean } = {},
): Promise<AddressVersionInsertContext> {
  const dataset = message.resourceReleaseId?.trim()
    ? await waitForDatasetRecord(metaDb, {
        resourceReleaseId: message.resourceReleaseId,
      })
    : await waitForDatasetRecord(metaDb, {
        releaseCode: message.releaseCode,
      })

  if (!dataset) {
    throw new Error(
      `Release not found: ${message.resourceReleaseId ?? message.releaseCode ?? message.datasetId}`,
    )
  }

  const lineageDataset = await resolveAddressLineageDataset(metaDb, dataset)
  const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'address', {
    regionCode: dataset.regionCode,
    cohortKey: dataset.cohortKey,
    datasetCode: lineageDataset.datasetCode,
    datasetId: lineageDataset.datasetId,
    sourceReleaseId: dataset.resourceReleaseId,
    variant: 'hkgov-dpo',
  })

  const historyYear = message.cohortKey.slice(0, 4)
  const sourceYear = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const [historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(
      metaDb,
      'history',
      environment,
      message.regionCode,
      historyYear,
    ),
    resolveShardForTypeRegionYear(
      metaDb,
      'source',
      environment,
      message.regionCode,
      sourceYear,
    ),
  ])

  if (!currentShard || !historyShard || !sourceShard) {
    throw new Error(
      `Shard mapping not found for ${message.regionCode}/history:${historyYear}/source:${sourceYear} in ${environment}.`,
    )
  }

  const releaseRole = dataset.source === 'hkgov-dpo' ? 'primary' : 'enrichment'

  await upsertSnapshotSource(
    metaDb,
    snapshot.id,
    dataset.resourceReleaseId,
    releaseRole,
    {
      anchorReleaseId: releaseRole === 'primary' ? dataset.resourceReleaseId : null,
      selectedByRule: 'assembly:address:source-release:v1',
      selectionMode: 'exact_ref',
    },
  )
  if (!options.deferAssembly)
    await recordSnapshotAssembly(metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'address',
      anchorReleaseId: releaseRole === 'primary' ? dataset.resourceReleaseId : null,
    })
  await upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, historyShard.id)
  await upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, sourceShard.id)
  await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)

  return {
    resourceReleaseId: dataset.resourceReleaseId,
    releaseRole,
    snapshotId: snapshot.id,
    cohortKey: message.cohortKey,
    parentSnapshotId: snapshot.parentSnapshotId,
    snapshotLineageId: snapshot.snapshotLineageId,
  }
}

async function resolveAddressLineageDataset(
  _metaDb: HarbourReadableDb,
  dataset: {
    datasetCode: string
    datasetId: string
    regionCode: string
    source: string
  },
) {
  return {
    datasetCode: dataset.datasetCode,
    datasetId: dataset.datasetId,
  }
}

export async function cloneAddressCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  fromSnapshotId: string,
  toSnapshotId: string,
  clonedAt = new Date().toISOString(),
) {
  if (fromSnapshotId === toSnapshotId) {
    return
  }

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2d)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
            streetSnapshotId: currentSchema.address2d.streetSnapshotId,
            id: currentSchema.address2d.id,
            streetId: currentSchema.address2d.streetId,
            hamletId: currentSchema.address2d.hamletId,
            microhoodId: currentSchema.address2d.microhoodId,
            villageId: currentSchema.address2d.villageId,
            neighbourhoodId: currentSchema.address2d.neighbourhoodId,
            ruralAreaId: currentSchema.address2d.ruralAreaId,
            macrohoodId: currentSchema.address2d.macrohoodId,
            townId: currentSchema.address2d.townId,
            districtId: currentSchema.address2d.districtId,
            landformId: currentSchema.address2d.landformId,
            areaId: currentSchema.address2d.areaId,
            countryId: currentSchema.address2d.countryId,
            identifiers: currentSchema.address2d.identifiers,
            sources: currentSchema.address2d.sources,
            parentAddressId: currentSchema.address2d.parentAddressId,
            granularity: currentSchema.address2d.granularity,
            geometry: currentSchema.address2d.geometry,
            createdAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2d)
          .where(eq(currentSchema.address2d.scopeId, fromSnapshotId)),
      )
      .onConflictDoNothing()
      .run(),
  )

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2dI18n)
      .select(
        db
          .select({
            meta: currentSchema.address2dI18n.meta,
            snapshotId: sql<string>`${toSnapshotId}`,
            addressId: currentSchema.address2dI18n.addressId,
            locale: currentSchema.address2dI18n.locale,
            formattedAddress: currentSchema.address2dI18n.formattedAddress,
            buildingName: currentSchema.address2dI18n.buildingName,
            buildingNumberExpression:
              currentSchema.address2dI18n.buildingNumberExpression,
            buildingNumberFrom: currentSchema.address2dI18n.buildingNumberFrom,
            buildingNumberTo: currentSchema.address2dI18n.buildingNumberTo,
            buildingNumberConnector:
              currentSchema.address2dI18n.buildingNumberConnector,
            blockExpression: currentSchema.address2dI18n.blockExpression,
            blockType: currentSchema.address2dI18n.blockType,
            blockRef: currentSchema.address2dI18n.blockRef,
            blockTypeBeforeNumber: currentSchema.address2dI18n.blockTypeBeforeNumber,
            phaseExpression: currentSchema.address2dI18n.phaseExpression,
            phaseName: currentSchema.address2dI18n.phaseName,
            phaseRef: currentSchema.address2dI18n.phaseRef,
            estateName: currentSchema.address2dI18n.estateName,
            streetName: currentSchema.address2dI18n.streetName,
            createdAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2dI18n)
          .where(eq(currentSchema.address2dI18n.scopeId, fromSnapshotId)),
      )
      .onConflictDoNothing()
      .run(),
  )

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.address2dBuildingNumberLookup)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            addressId: currentSchema.address2dBuildingNumberLookup.addressId,
            buildingNumber: currentSchema.address2dBuildingNumberLookup.buildingNumber,
            numericStem: currentSchema.address2dBuildingNumberLookup.numericStem,
            evidence: currentSchema.address2dBuildingNumberLookup.evidence,
            derivation: currentSchema.address2dBuildingNumberLookup.derivation,
            createdAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2dBuildingNumberLookup)
          .where(
            eq(currentSchema.address2dBuildingNumberLookup.scopeId, fromSnapshotId),
          ),
      )
      .onConflictDoNothing()
      .run(),
  )
}

export async function alignAddressCurrentDivisionSnapshot(
  db: HarbourWritableDb,
  snapshotId: string,
  divisionSnapshotId: string,
) {
  await runRawSql(
    db,
    sql.raw(
      buildAlignAddressCurrentDivisionSnapshotSql(snapshotId, divisionSnapshotId),
    ),
  )
}

export async function deleteStaleAddressCurrentRows(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  staleIds: string[],
) {
  if (staleIds.length === 0) {
    return 0
  }

  await deleteAddressCurrentRowsByIds(db, snapshotId, staleIds)

  return staleIds.length
}

export async function upsertAddressCurrentStates(
  db: HarbourWritableDb,
  rows: AddressBaseRecord[],
) {
  if (rows.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(CURRENT_ADDRESS2D_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(currentSchema.address2d)
        .values(chunk)
        .onConflictDoUpdate({
          target: [currentSchema.address2d.scopeId, currentSchema.address2d.id],
          set: {
            divisionSnapshotId: excluded('divisionSnapshotId'),
            streetSnapshotId: excluded('streetSnapshotId'),
            streetId: excluded('streetId'),
            hamletId: excluded('hamletId'),
            microhoodId: excluded('microhoodId'),
            villageId: excluded('villageId'),
            neighbourhoodId: excluded('neighbourhoodId'),
            ruralAreaId: excluded('ruralAreaId'),
            macrohoodId: excluded('macrohoodId'),
            townId: excluded('townId'),
            districtId: excluded('districtId'),
            landformId: excluded('landformId'),
            areaId: excluded('areaId'),
            countryId: excluded('countryId'),
            geometry: excluded('geometry'),
            identifiers: excluded('identifiers'),
            sources: excluded('sources'),
            parentAddressId: excluded('parentAddressId'),
            granularity: excluded('granularity'),
          },
        })
        .run(),
    )
  }
}

export async function replaceAddressCurrentI18n(
  db: HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
  rows: NewAddressI18nRow[],
) {
  if (addressIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause())) {
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2dI18n)
        .where(
          and(
            eq(currentSchema.address2dI18n.scopeId, snapshotId),
            inArray(currentSchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  if (rows.length > 0) {
    await insertAddressI18nInChunks(db, rows)
  }
}

export async function replaceAddressCurrentBuildingNumberLookups(
  db: HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
  i18nRows: NewAddressI18nRow[],
) {
  if (addressIds.length === 0) return

  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause(1))) {
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2dBuildingNumberLookup)
        .where(
          and(
            eq(currentSchema.address2dBuildingNumberLookup.scopeId, snapshotId),
            inArray(currentSchema.address2dBuildingNumberLookup.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  const timestamp = new Date().toISOString()
  const rows = buildAddressBuildingNumberLookupRows(i18nRows).map(row => ({
    ...row,
    snapshotId,
    createdAt: timestamp,
  }))
  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(CURRENT_ADDRESS2D_BUILDING_LOOKUP_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db.insert(currentSchema.address2dBuildingNumberLookup).values(chunk).run(),
    )
  }
}

/**
 * Seeds a draft current snapshot from immutable history when its parent is no
 * longer retained in current storage. This is intentionally limited to an
 * empty target snapshot: a partially written snapshot must be resumed through
 * its import journal rather than silently overwritten.
 */
export async function materialiseReplayedAddressCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  divisionSnapshotId: string,
  versions: Iterable<ReplayedAddressVersionSnapshot>,
  materialisedAt = new Date().toISOString(),
) {
  const existing = await db
    .select({ id: currentSchema.address2d.id })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.scopeId, snapshotId))
    .limit(1)
    .get()
  if (existing) {
    throw new Error(
      `Address snapshot ${snapshotId} is already materialised in current storage; refusing to replace it from historical replay.`,
    )
  }

  const divisionIds = new Set(
    (
      await db
        .select({ id: currentSchema.divisions.id })
        .from(currentSchema.divisions)
        .where(eq(currentSchema.divisions.scopeId, divisionSnapshotId))
        .all()
    ).map(row => row.id),
  )
  const rows = [...versions]
  const baseRows: AddressBaseRecord[] = rows.map(({ base }) => ({
    ...base,
    scopeId: snapshotId,
    divisionSnapshotId,
    streetId: null,
    streetSnapshotId: null,
    countryId: resolveReplayedDivisionReference(base.countryId, divisionIds),
    landformId: resolveReplayedDivisionReference(base.landformId, divisionIds),
    areaId: resolveReplayedDivisionReference(base.areaId, divisionIds),
    districtId: resolveReplayedDivisionReference(base.districtId, divisionIds),
    townId: resolveReplayedDivisionReference(base.townId, divisionIds),
    ruralAreaId: resolveReplayedDivisionReference(base.ruralAreaId, divisionIds),
    macrohoodId: resolveReplayedDivisionReference(base.macrohoodId, divisionIds),
    villageId: resolveReplayedDivisionReference(base.villageId, divisionIds),
    neighbourhoodId: resolveReplayedDivisionReference(
      base.neighbourhoodId,
      divisionIds,
    ),
    hamletId: resolveReplayedDivisionReference(base.hamletId, divisionIds),
    microhoodId: resolveReplayedDivisionReference(base.microhoodId, divisionIds),
    createdAt: materialisedAt,
  }))
  const i18nRows: NewAddressI18nRow[] = rows.flatMap(version =>
    version.localisedRows.map(row => ({
      ...row,
      scopeId: snapshotId,
      createdAt: materialisedAt,
    })),
  )

  await upsertAddressCurrentStates(db, baseRows)
  await replaceAddressCurrentI18n(
    db,
    snapshotId,
    baseRows.map(row => row.id),
    i18nRows,
  )
  await replaceAddressCurrentBuildingNumberLookups(
    db,
    snapshotId,
    baseRows.map(row => row.id),
    i18nRows,
  )
}

function resolveReplayedDivisionReference(
  id: string | null,
  divisionIds: ReadonlySet<string>,
) {
  return id && divisionIds.has(id) ? id : null
}

async function deleteAddressCurrentRowsByIds(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
) {
  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 2))) {
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2dI18n)
        .where(
          and(
            eq(currentSchema.address2dI18n.scopeId, snapshotId),
            inArray(currentSchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      db
        .delete(currentSchema.address2d)
        .where(
          and(
            eq(currentSchema.address2d.scopeId, snapshotId),
            inArray(currentSchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
  }
}

export async function insertAddressVersionRows(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  context: AddressVersionInsertContext,
  baseRows: Array<
    Omit<AddressBaseRecord, 'scopeId'> & {
      versionHash: string
    }
  >,
  i18nRows: Array<
    AddressI18nPayload & {
      snapshotId: string
      isCurrent: boolean
      versionHash: string
      createdAt: string
    }
  >,
  lookupRows: Parameters<
    typeof insertAddressBuildingNumberLookupVersionsInChunks
  >[1] = [],
) {
  for (const chunk of chunkArray(
    baseRows,
    getMaxRowsPerInsert(
      HISTORY_ADDRESS2D_VERSION_COLUMN_COUNT,
      HISTORY_ADDRESS2D_VERSION_UPSERT_FIXED_VARIABLE_COUNT,
    ),
  )) {
    await runWithWriteRetry(() =>
      historyDb
        .insert(historySchema.address2d)
        .values(
          chunk.map(row => ({
            id: row.id,
            versionHash: row.versionHash,
            snapshotId: context.snapshotId,
            isCurrent: true,
            streetId: row.streetId,
            hamletId: row.hamletId,
            microhoodId: row.microhoodId,
            villageId: row.villageId,
            neighbourhoodId: row.neighbourhoodId,
            ruralAreaId: row.ruralAreaId,
            macrohoodId: row.macrohoodId,
            townId: row.townId,
            districtId: row.districtId,
            landformId: row.landformId,
            areaId: row.areaId,
            countryId: row.countryId,
            geometry: row.geometry,
            identifiers: row.identifiers,
            sources: row.sources,
            parentAddressId: row.parentAddressId,
            granularity: row.granularity,
            createdAt: row.createdAt,
          })),
        )
        .onConflictDoNothing({
          target: [historySchema.address2d.id, historySchema.address2d.snapshotId],
        })
        .run(),
    )
  }

  if (i18nRows.length > 0) {
    await insertAddressVersionsI18nInChunks(historyDb, i18nRows)
  }
  await insertAddressBuildingNumberLookupVersionsInChunks(historyDb, lookupRows)
}

async function insertAddressBuildingNumberLookupVersionsInChunks(
  db: HarbourWritableDb,
  rows: Array<
    ReturnType<typeof buildAddressBuildingNumberLookupRows>[number] & {
      snapshotId: string
      isCurrent: boolean
      versionHash: string
      createdAt: string
    }
  >,
) {
  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(HISTORY_ADDRESS2D_BUILDING_LOOKUP_VERSION_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(historySchema.address2dBuildingNumberLookup)
        .values(chunk)
        .onConflictDoNothing({
          target: [
            historySchema.address2dBuildingNumberLookup.addressId,
            historySchema.address2dBuildingNumberLookup.snapshotId,
            historySchema.address2dBuildingNumberLookup.buildingNumber,
          ],
        })
        .run(),
    )
  }
}

async function insertAddressI18nInChunks(
  db: HarbourWritableDb,
  rows: NewAddressI18nRow[],
) {
  const uniqueRows = [
    ...new Map(
      rows.map(row => [`${row.scopeId}\0${row.addressId}\0${row.locale}`, row]),
    ).values(),
  ]

  for (const chunk of chunkArray(
    uniqueRows,
    getMaxRowsPerInsert(CURRENT_ADDRESS2D_I18N_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(currentSchema.address2dI18n)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            currentSchema.address2dI18n.scopeId,
            currentSchema.address2dI18n.addressId,
            currentSchema.address2dI18n.locale,
          ],
          set: {
            meta: excluded('meta'),
            formattedAddress: excluded('formattedAddress'),
            buildingName: excluded('buildingName'),
            buildingNumberExpression: excluded('buildingNumberExpression'),
            buildingNumberFrom: excluded('buildingNumberFrom'),
            buildingNumberTo: excluded('buildingNumberTo'),
            buildingNumberConnector: excluded('buildingNumberConnector'),
            blockExpression: excluded('blockExpression'),
            blockType: excluded('blockType'),
            blockRef: excluded('blockRef'),
            blockTypeBeforeNumber: excluded('blockTypeBeforeNumber'),
            phaseExpression: excluded('phaseExpression'),
            phaseName: excluded('phaseName'),
            phaseRef: excluded('phaseRef'),
            estateName: excluded('estateName'),
            streetName: excluded('streetName'),
          },
        })
        .run(),
    )
  }
}

async function insertAddressVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<
    AddressI18nPayload & {
      snapshotId: string
      isCurrent: boolean
      versionHash: string
      createdAt: string
    }
  >,
) {
  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(HISTORY_ADDRESS2D_I18N_VERSION_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(historySchema.address2dI18n)
        .values(chunk)
        .onConflictDoNothing({
          target: [
            historySchema.address2dI18n.addressId,
            historySchema.address2dI18n.snapshotId,
            historySchema.address2dI18n.locale,
          ],
        })
        .run(),
    )
  }
}

/** Compare against the explicitly selected parent across all retained owners. */
export async function getAddressVersionMapForSnapshotDbs(
  metaDb: HarbourReadableDb,
  dbs: HarbourReadableDb[],
  snapshotId: string | null,
  options: AddressVersionLookupOptions,
) {
  if (!snapshotId) return new Map<string, AddressVersionSnapshot>()
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  const groups = await resolveStatisticEvents(
    dbs,
    plan.map(step => step.snapshotId),
    ['address2d', 'address2dI18n'],
  )
  const versions: ResolvedSnapshotVersion[] = [...groups].flatMap(
    ([db, events], index) =>
      events.map(event => ({
        ...event,
        sourceReleaseId: snapshotEventProducer(
          plan.find(step => step.snapshotId === event.snapshotId)!,
        ),
        shard: { bindingName: String(index), db },
      })),
  )
  return buildAddressVersionSnapshotMapFromRows(
    await loadReplayedAddressBaseRows(
      versions.filter(row => row.recordType === 'address2d'),
    ),
    await loadReplayedAddressI18nRows(
      versions.filter(row => row.recordType === 'address2dI18n'),
    ),
    options,
  )
}
