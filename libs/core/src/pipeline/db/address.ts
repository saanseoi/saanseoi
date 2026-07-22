import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { DatasetProcessingMessage } from '../../types'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  waitForDatasetRecord,
} from '../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'
import type { CurrentAddressVersionRow } from '@repo/db/historySchema'
import { currentSchema, historySchema } from '@repo/db'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runWithWriteRetry,
} from '../utils'
import { recordSnapshotVersionChanges } from './snapshotVersionChanges'
import { buildAddressBuildingNumberLookupRows } from '../services/addressPipeline/normalisation'

const CURRENT_ADDRESS2D_COLUMN_COUNT = 20
const CURRENT_ADDRESS2D_I18N_COLUMN_COUNT = 20
const CURRENT_ADDRESS2D_BUILDING_LOOKUP_COLUMN_COUNT = 8
const HISTORY_ADDRESS2D_VERSION_COLUMN_COUNT = 21
const HISTORY_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = 20
const HISTORY_ADDRESS2D_VERSION_UPSERT_FIXED_VARIABLE_COUNT = 7
const SEEN_ADDRESS_ID_INSERT_COLUMN_COUNT = 1
const ADDRESS_DIVISION_REFERENCE_COLUMNS = [
  'countryId',
  'areaId',
  'districtId',
  'townId',
  'macrohoodId',
  'villageId',
  'neighbourhoodId',
  'hamletId',
  'microhoodId',
] as const

const tempSeenAddressIds = sqliteTable('tempSeenAddressIds', {
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

type AddressVersionLookupOptions = {
  buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
  buildMatchKey: (input: AddressCurrentMatchInput) => string | null
  normaliseAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
}

type AddressHashInput = Omit<
  AddressRow,
  'snapshotId' | 'createdAt' | 'updatedAt' | 'divisionSnapshotId' | 'streetSnapshotId'
>

type CurrentAddressVersionLookupRow = Pick<
  CurrentAddressVersionRow,
  | 'areaId'
  | 'bbox'
  | 'countryId'
  | 'districtId'
  | 'geometry'
  | 'hamletId'
  | 'id'
  | 'identifiers'
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
  releaseId: string
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
  updatedAtSql = "datetime('now')",
) {
  const assignments = ADDRESS_DIVISION_REFERENCE_COLUMNS.map(
    column => `  ${column} = CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM divisions
      WHERE divisions.snapshotId = ${sqlLiteral(divisionSnapshotId)}
        AND divisions.id = address2d.${column}
    ) THEN ${column}
    ELSE NULL
  END`,
  )

  return `
UPDATE address2d
SET
  divisionSnapshotId = ${sqlLiteral(divisionSnapshotId)},
${assignments.join(',\n')},
  updatedAt = ${updatedAtSql}
WHERE snapshotId = ${sqlLiteral(snapshotId)};`.trim()
}

function selectCurrentAddressVersionFields() {
  return {
    id: historySchema.address2d.id,
    streetId: historySchema.address2d.streetId,
    hamletId: historySchema.address2d.hamletId,
    microhoodId: historySchema.address2d.microhoodId,
    villageId: historySchema.address2d.villageId,
    neighbourhoodId: historySchema.address2d.neighbourhoodId,
    macrohoodId: historySchema.address2d.macrohoodId,
    townId: historySchema.address2d.townId,
    districtId: historySchema.address2d.districtId,
    areaId: historySchema.address2d.areaId,
    countryId: historySchema.address2d.countryId,
    geometry: historySchema.address2d.geometry,
    identifiers: historySchema.address2d.identifiers,
    bbox: historySchema.address2d.bbox,
    sources: historySchema.address2d.sources,
    versionHash: historySchema.address2d.versionHash,
  }
}

function normaliseAddressMatchToken(value: string | null) {
  const normalised = value?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalised || null
}

function normaliseAddressSqlMatchToken(value: string) {
  return value.replace(/\s+/g, '')
}

function sqlAddressMatchToken(
  column:
    | typeof historySchema.address2dI18n.streetName
    | typeof historySchema.address2dI18n.buildingNumberFrom
    | typeof historySchema.address2dI18n.buildingNumberTo,
) {
  return sql`replace(replace(replace(replace(upper(trim(${column})), ' ', ''), char(9), ''), char(10), ''), char(13), '')`
}

export async function getCurrentAddressVersionMap(
  db: HarbourReadableDb,
  options: {
    buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
    buildMatchKey: (input: {
      buildingNumberFrom: string | null
      buildingNumberTo: string | null
      districtId: string | null
      streetName: string | null
    }) => string | null
    normaliseAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
) {
  const versionRows = (await db
    .select(selectCurrentAddressVersionFields())
    .from(historySchema.address2d)
    .where(eq(historySchema.address2d.isCurrent, true))
    .all()) as CurrentAddressVersionLookupRow[]

  return buildCurrentAddressVersionSnapshotMap(db, versionRows, options)
}

export async function getCurrentAddressVersionLookup(
  db: HarbourReadableDb,
  addressIds: string[],
  matchInputs: AddressCurrentMatchInput[],
  options: AddressVersionLookupOptions,
): Promise<CurrentAddressVersionLookupResult> {
  const byIdRows: CurrentAddressVersionLookupRow[] = []

  for (const idChunk of chunkArray(
    [...new Set(addressIds)],
    getMaxItemsPerInClause(1, 2),
  )) {
    if (idChunk.length === 0) {
      continue
    }

    byIdRows.push(
      ...((await db
        .select(selectCurrentAddressVersionFields())
        .from(historySchema.address2d)
        .where(
          and(
            eq(historySchema.address2d.isCurrent, true),
            inArray(historySchema.address2d.id, idChunk),
          ),
        )
        .all()) as CurrentAddressVersionLookupRow[]),
    )
  }

  const matchRows: CurrentAddressVersionLookupRow[] = []
  const uniqueMatchInputs = new Map<
    string,
    {
      districtId: string
      streetName: string
      buildingNumberFrom: string
      buildingNumberTo: string | null
    }
  >()

  for (const input of matchInputs) {
    const districtId = input.districtId
    const buildingNumberFrom = normaliseAddressMatchToken(input.buildingNumberFrom)
    const buildingNumberTo = normaliseAddressMatchToken(input.buildingNumberTo)
    const streetName = normaliseAddressMatchToken(input.streetName)

    if (!districtId || !buildingNumberFrom || !streetName) {
      continue
    }

    uniqueMatchInputs.set(
      `${districtId}\0${buildingNumberFrom}\0${buildingNumberTo ?? ''}\0${streetName}`,
      {
        districtId,
        streetName: normaliseAddressSqlMatchToken(streetName),
        buildingNumberFrom: normaliseAddressSqlMatchToken(buildingNumberFrom),
        buildingNumberTo: buildingNumberTo
          ? normaliseAddressSqlMatchToken(buildingNumberTo)
          : null,
      },
    )
  }

  for (const inputChunk of chunkArray([...uniqueMatchInputs.values()], 24)) {
    if (inputChunk.length === 0) {
      continue
    }

    const predicates = inputChunk.map(input =>
      and(
        eq(historySchema.address2d.districtId, input.districtId),
        sql`${sqlAddressMatchToken(historySchema.address2dI18n.buildingNumberFrom)} = ${
          input.buildingNumberFrom
        }`,
        input.buildingNumberTo
          ? sql`${sqlAddressMatchToken(historySchema.address2dI18n.buildingNumberTo)} = ${
              input.buildingNumberTo
            }`
          : sql`${historySchema.address2dI18n.buildingNumberTo} is null`,
        sql`${sqlAddressMatchToken(historySchema.address2dI18n.streetName)} = ${
          input.streetName
        }`,
      ),
    )

    matchRows.push(
      ...((await db
        .select(selectCurrentAddressVersionFields())
        .from(historySchema.address2d)
        .innerJoin(
          historySchema.address2dI18n,
          and(
            eq(historySchema.address2d.id, historySchema.address2dI18n.addressId),
            eq(historySchema.address2dI18n.isCurrent, true),
            eq(historySchema.address2dI18n.locale, 'en'),
          ),
        )
        .where(and(eq(historySchema.address2d.isCurrent, true), or(...predicates)))
        .all()) as CurrentAddressVersionLookupRow[]),
    )
  }

  const snapshots = await buildCurrentAddressVersionSnapshotMap(
    db,
    [...byIdRows, ...matchRows],
    options,
  )
  const byMatchKey = new Map<string, AddressVersionSnapshot>()

  for (const snapshot of snapshots.values()) {
    if (snapshot.matchKey && !byMatchKey.has(snapshot.matchKey)) {
      byMatchKey.set(snapshot.matchKey, snapshot)
    }
  }

  return {
    byId: snapshots,
    byMatchKey,
  }
}

/**
 * Looks up current address versions across history shards. Later sources take
 * precedence, so callers can place the target shard after its predecessors.
 */
export async function getMergedCurrentAddressVersionLookup(
  sources: Array<{
    db: unknown
    sortOrder: number
  }>,
  addressIds: string[],
  matchInputs: AddressCurrentMatchInput[],
  options: AddressVersionLookupOptions,
): Promise<CurrentAddressVersionLookupResult> {
  const byId = new Map<string, AddressVersionSnapshot>()
  const byMatchKey = new Map<string, AddressVersionSnapshot>()

  for (const source of [...sources].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const lookup = await getCurrentAddressVersionLookup(
      source.db as HarbourReadableDb,
      addressIds,
      matchInputs,
      options,
    )

    for (const [id, snapshot] of lookup.byId) {
      byId.set(id, snapshot)
    }

    for (const [matchKey, snapshot] of lookup.byMatchKey) {
      byMatchKey.set(matchKey, snapshot)
    }
  }

  return { byId, byMatchKey }
}

export async function hasCurrentAddressVersions(db: HarbourReadableDb) {
  const row = await db
    .select({
      id: historySchema.address2d.id,
    })
    .from(historySchema.address2d)
    .where(eq(historySchema.address2d.isCurrent, true))
    .limit(1)
    .get()

  return Boolean(row)
}

export async function prepareSeenAddressIdTable(db: HarbourWritableDb) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenAddressIds`)
  await runRawSql(db, sql`CREATE TEMP TABLE tempSeenAddressIds (id TEXT PRIMARY KEY)`)
}

export async function insertSeenAddressIds(
  db: HarbourWritableDb,
  addressIds: string[],
) {
  const uniqueIds = [...new Set(addressIds)]

  if (uniqueIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    uniqueIds,
    getMaxRowsPerInsert(SEEN_ADDRESS_ID_INSERT_COLUMN_COUNT),
  )) {
    await runWithWriteRetry(() =>
      db
        .insert(tempSeenAddressIds)
        .values(chunk.map(id => ({ id })))
        .onConflictDoNothing()
        .run(),
    )
  }
}

export async function dropSeenAddressIdTable(db: HarbourWritableDb) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenAddressIds`)
}

async function buildCurrentAddressVersionSnapshotMap(
  db: HarbourReadableDb,
  versionRows: CurrentAddressVersionLookupRow[],
  options: {
    buildAddressBaseHashInput: (base: AddressHashInput) => AddressHashInput
    buildMatchKey: (input: AddressCurrentMatchInput) => string | null
    normaliseAddressI18nSnapshotRow: (row: AddressI18nPayload) => AddressI18nPayload
  },
) {
  const rows = [...new Map(versionRows.map(row => [row.id, row])).values()]

  if (rows.length === 0) {
    return new Map<string, AddressVersionSnapshot>()
  }

  const i18nRows: AddressI18nPayload[] = []
  const addressIds = rows.map(row => row.id)

  for (const addressIdChunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 1))) {
    const chunkRows = (await db
      .select({
        addressId: historySchema.address2dI18n.addressId,
        locale: historySchema.address2dI18n.locale,
        formattedAddress: historySchema.address2dI18n.formattedAddress,
        buildingName: historySchema.address2dI18n.buildingName,
        buildingNumberExpression: historySchema.address2dI18n.buildingNumberExpression,
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
      })
      .from(historySchema.address2dI18n)
      .where(
        and(
          inArray(historySchema.address2dI18n.addressId, addressIdChunk),
          eq(historySchema.address2dI18n.isCurrent, true),
        ),
      )
      .all()) as AddressI18nPayload[]

    i18nRows.push(...chunkRows)
  }

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

export async function prepareAddressVersionInsertContext(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
): Promise<AddressVersionInsertContext> {
  const dataset = message.releaseId?.trim()
    ? await waitForDatasetRecord(metaDb, {
        releaseId: message.releaseId,
      })
    : await waitForDatasetRecord(metaDb, {
        releaseCode: message.releaseCode,
      })

  if (!dataset) {
    throw new Error(
      `Release not found: ${message.releaseId ?? message.releaseCode ?? message.datasetId}`,
    )
  }

  const lineageDataset = await resolveAddressLineageDataset(metaDb, dataset)
  const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'address', {
    regionCode: dataset.regionCode,
    cohortKey: dataset.cohortKey,
    datasetCode: lineageDataset.datasetCode,
    datasetId: lineageDataset.datasetId,
    sourceReleaseId: dataset.releaseId,
    variant: 'default',
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
    dataset.datasetId,
    dataset.releaseId,
    releaseRole,
    {
      anchorReleaseId: releaseRole === 'primary' ? dataset.releaseId : null,
      selectedByRule: 'snapshot-assembly-address-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: dataset.cohortKey,
    },
  )
  await recordSnapshotAssemblyRun(metaDb, {
    snapshotId: snapshot.id,
    resourceType: 'address',
    anchorReleaseId: releaseRole === 'primary' ? dataset.releaseId : null,
    anchorCohortKey: dataset.cohortKey,
    selectionSummaryJson: {
      releaseRole,
      sourceReleaseId: dataset.releaseId,
      sourceVersion: dataset.sourceVersion,
    },
  })
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id)
  await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)

  return {
    releaseId: dataset.releaseId,
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
            macrohoodId: currentSchema.address2d.macrohoodId,
            townId: currentSchema.address2d.townId,
            districtId: currentSchema.address2d.districtId,
            areaId: currentSchema.address2d.areaId,
            countryId: currentSchema.address2d.countryId,
            identifiers: currentSchema.address2d.identifiers,
            sources: currentSchema.address2d.sources,
            geometry: currentSchema.address2d.geometry,
            bbox: currentSchema.address2d.bbox,
            createdAt: sql<string>`${clonedAt}`,
            updatedAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2d)
          .where(eq(currentSchema.address2d.snapshotId, fromSnapshotId)),
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
            updatedAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2dI18n)
          .where(eq(currentSchema.address2dI18n.snapshotId, fromSnapshotId)),
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
            updatedAt: sql<string>`${clonedAt}`,
          })
          .from(currentSchema.address2dBuildingNumberLookup)
          .where(
            eq(currentSchema.address2dBuildingNumberLookup.snapshotId, fromSnapshotId),
          ),
      )
      .onConflictDoNothing()
      .run(),
  )
}

export async function touchAddressCurrentRows(
  db: HarbourWritableDb,
  snapshotId: string,
  addressIds: string[],
  updatedAt: string,
) {
  if (addressIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    [...new Set(addressIds)],
    getMaxItemsPerInClause(1, 2),
  )) {
    await runWithWriteRetry(() =>
      db
        .update(currentSchema.address2d)
        .set({ updatedAt })
        .where(
          and(
            eq(currentSchema.address2d.snapshotId, snapshotId),
            inArray(currentSchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
  }
}

export async function alignAddressCurrentDivisionSnapshot(
  db: HarbourWritableDb,
  snapshotId: string,
  divisionSnapshotId: string,
) {
  await runRawSql(
    db,
    sql.raw(
      buildAlignAddressCurrentDivisionSnapshotSql(
        snapshotId,
        divisionSnapshotId,
        sqlLiteral(new Date().toISOString()),
      ),
    ),
  )
}

export async function closeCurrentAddressVersions(
  db: HarbourReadableDb & HarbourWritableDb,
  addressIds: string[],
  snapshotId: string,
  _cohortKey: string,
  sourceReleaseId?: string,
) {
  if (addressIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const currentI18nRows: Array<{ addressId: string; locale: string }> = []

  for (const chunk of chunkArray(addressIds, getMaxItemsPerInClause(1, 5))) {
    currentI18nRows.push(
      ...(await db
        .select({
          addressId: historySchema.address2dI18n.addressId,
          locale: historySchema.address2dI18n.locale,
        })
        .from(historySchema.address2dI18n)
        .where(
          and(
            eq(historySchema.address2dI18n.isCurrent, true),
            inArray(historySchema.address2dI18n.addressId, chunk),
          ),
        )
        .all()),
    )
    await runWithWriteRetry(() =>
      db
        .update(historySchema.address2d)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2d.isCurrent, true),
            inArray(historySchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      db
        .update(historySchema.address2dI18n)
        .set({ isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(historySchema.address2dI18n.isCurrent, true),
            inArray(historySchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId,
    recordType: 'address2d',
    operation: 'delete',
    changes: addressIds.map(recordId => ({ recordId })),
  })
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId,
    recordType: 'address2dI18n',
    operation: 'delete',
    changes: currentI18nRows.map(row => ({
      recordId: row.addressId,
      locale: row.locale,
    })),
  })
}

export async function deleteMissingCurrentAddresses(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  _cohortKey: string,
  currentRows: Map<string, AddressVersionSnapshot>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return {
      count: 0,
      missingIds,
    }
  }

  const now = new Date().toISOString()

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2d)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2d.isCurrent, true),
            inArray(historySchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dI18n)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dI18n.isCurrent, true),
            inArray(historySchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  await recordSnapshotVersionChanges(historyDb, {
    snapshotId,
    recordType: 'address2d',
    operation: 'delete',
    changes: missingIds.map(recordId => ({ recordId })),
  })

  return {
    count: missingIds.length,
    missingIds,
  }
}

export async function deleteMissingCurrentAddressesBySeenIds(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  seenIds: Set<string>,
) {
  const missingIds: string[] = []
  let lastId = ''

  while (true) {
    const rows = (await historyDb
      .select({
        id: historySchema.address2d.id,
      })
      .from(historySchema.address2d)
      .where(
        and(
          eq(historySchema.address2d.isCurrent, true),
          gt(historySchema.address2d.id, lastId),
        ),
      )
      .orderBy(historySchema.address2d.id)
      .limit(500)
      .all()) as Array<{ id: string }>

    if (rows.length === 0) {
      break
    }

    const pageMissingIds = rows.map(row => row.id).filter(id => !seenIds.has(id))

    if (pageMissingIds.length > 0) {
      await closeMissingCurrentAddressRows(
        historyDb,
        snapshotId,
        cohortKey,
        pageMissingIds,
      )
      missingIds.push(...pageMissingIds)
    }

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastId = lastRow.id
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

export async function deleteMissingCurrentAddressesBySeenTable(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
) {
  const missingIds: string[] = []
  let lastId = ''

  while (true) {
    const rows = (await historyDb
      .select({
        id: historySchema.address2d.id,
      })
      .from(historySchema.address2d)
      .where(
        and(
          eq(historySchema.address2d.isCurrent, true),
          gt(historySchema.address2d.id, lastId),
          sql`NOT EXISTS (
            SELECT 1
            FROM tempSeenAddressIds seen
            WHERE seen.id = ${historySchema.address2d.id}
          )`,
        ),
      )
      .orderBy(historySchema.address2d.id)
      .limit(500)
      .all()) as Array<{ id: string }>

    if (rows.length === 0) {
      break
    }

    const pageMissingIds = rows.map(row => row.id)

    await closeMissingCurrentAddressRows(
      historyDb,
      snapshotId,
      cohortKey,
      pageMissingIds,
    )
    missingIds.push(...pageMissingIds)

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastId = lastRow.id
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

export async function deleteMissingCurrentAddressesByCurrentMarker(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  currentDb: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  cohortKey: string,
  touchedAt: string,
) {
  const missingIds: string[] = []
  let lastId = ''

  while (true) {
    const rows = (await currentDb
      .select({
        id: currentSchema.address2d.id,
      })
      .from(currentSchema.address2d)
      .where(
        and(
          eq(currentSchema.address2d.snapshotId, snapshotId),
          gt(currentSchema.address2d.id, lastId),
          sql`${currentSchema.address2d.updatedAt} <> ${touchedAt}`,
        ),
      )
      .orderBy(currentSchema.address2d.id)
      .limit(500)
      .all()) as Array<{ id: string }>

    if (rows.length === 0) {
      break
    }

    const pageMissingIds = rows.map(row => row.id)

    await closeMissingCurrentAddressRows(
      historyDb,
      snapshotId,
      cohortKey,
      pageMissingIds,
    )
    await deleteAddressCurrentRowsByIds(currentDb, snapshotId, pageMissingIds)
    missingIds.push(...pageMissingIds)

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastId = lastRow.id
  }

  return {
    count: missingIds.length,
    missingIds,
  }
}

async function closeMissingCurrentAddressRows(
  historyDb: HarbourWritableDb,
  snapshotId: string,
  _cohortKey: string,
  missingIds: string[],
) {
  const now = new Date().toISOString()

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause(1, 5))) {
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2d)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2d.isCurrent, true),
            inArray(historySchema.address2d.id, chunk),
          ),
        )
        .run(),
    )
    await runWithWriteRetry(() =>
      historyDb
        .update(historySchema.address2dI18n)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.address2dI18n.isCurrent, true),
            inArray(historySchema.address2dI18n.addressId, chunk),
          ),
        )
        .run(),
    )
  }

  await recordSnapshotVersionChanges(historyDb, {
    snapshotId,
    recordType: 'address2d',
    operation: 'delete',
    changes: missingIds.map(recordId => ({ recordId })),
  })
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
          target: [currentSchema.address2d.snapshotId, currentSchema.address2d.id],
          set: {
            divisionSnapshotId: excluded('divisionSnapshotId'),
            streetSnapshotId: excluded('streetSnapshotId'),
            streetId: excluded('streetId'),
            hamletId: excluded('hamletId'),
            microhoodId: excluded('microhoodId'),
            villageId: excluded('villageId'),
            neighbourhoodId: excluded('neighbourhoodId'),
            macrohoodId: excluded('macrohoodId'),
            townId: excluded('townId'),
            districtId: excluded('districtId'),
            areaId: excluded('areaId'),
            countryId: excluded('countryId'),
            geometry: excluded('geometry'),
            identifiers: excluded('identifiers'),
            bbox: excluded('bbox'),
            sources: excluded('sources'),
            updatedAt: excluded('updatedAt'),
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
            eq(currentSchema.address2dI18n.snapshotId, snapshotId),
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
            eq(currentSchema.address2dBuildingNumberLookup.snapshotId, snapshotId),
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
    updatedAt: timestamp,
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
            eq(currentSchema.address2dI18n.snapshotId, snapshotId),
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
            eq(currentSchema.address2d.snapshotId, snapshotId),
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
    AddressBaseRecord & {
      versionHash: string
    }
  >,
  i18nRows: Array<
    AddressI18nPayload & {
      sourceReleaseId: string
      snapshotId: string
      isCurrent: boolean
      versionHash: string
      createdAt: string
      updatedAt: string
    }
  >,
) {
  if (baseRows.length === 0) {
    return
  }

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
            sourceReleaseId: context.releaseId,
            snapshotId: context.snapshotId,
            isCurrent: true,
            streetId: row.streetId,
            hamletId: row.hamletId,
            microhoodId: row.microhoodId,
            villageId: row.villageId,
            neighbourhoodId: row.neighbourhoodId,
            macrohoodId: row.macrohoodId,
            townId: row.townId,
            districtId: row.districtId,
            areaId: row.areaId,
            countryId: row.countryId,
            geometry: row.geometry,
            bbox: row.bbox,
            identifiers: row.identifiers,
            sources: row.sources,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [historySchema.address2d.id, historySchema.address2d.versionHash],
          set: {
            isCurrent: true,
            sourceReleaseId: context.releaseId,
            snapshotId: context.snapshotId,
            updatedAt: excluded('updatedAt'),
          },
        })
        .run(),
    )
  }

  await recordSnapshotVersionChanges(historyDb, {
    snapshotId: context.snapshotId,
    sourceReleaseId: context.releaseId,
    recordType: 'address2d',
    operation: 'upsert',
    changes: baseRows.map(row => ({
      recordId: row.id,
      versionHash: row.versionHash,
    })),
  })

  if (i18nRows.length > 0) {
    await insertAddressVersionsI18nInChunks(historyDb, i18nRows)
    await recordSnapshotVersionChanges(historyDb, {
      snapshotId: context.snapshotId,
      sourceReleaseId: context.releaseId,
      recordType: 'address2dI18n',
      operation: 'upsert',
      changes: i18nRows.map(row => ({
        recordId: row.addressId,
        locale: row.locale,
        versionHash: row.versionHash,
      })),
    })
  }
}

async function insertAddressI18nInChunks(
  db: HarbourWritableDb,
  rows: NewAddressI18nRow[],
) {
  const uniqueRows = [
    ...new Map(
      rows.map(row => [`${row.snapshotId}\0${row.addressId}\0${row.locale}`, row]),
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
            currentSchema.address2dI18n.snapshotId,
            currentSchema.address2dI18n.addressId,
            currentSchema.address2dI18n.locale,
          ],
          set: {
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
            updatedAt: excluded('updatedAt'),
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
      sourceReleaseId: string
      snapshotId: string
      isCurrent: boolean
      versionHash: string
      createdAt: string
      updatedAt: string
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
        .onConflictDoUpdate({
          target: [
            historySchema.address2dI18n.addressId,
            historySchema.address2dI18n.versionHash,
            historySchema.address2dI18n.locale,
          ],
          set: {
            sourceReleaseId: excluded('sourceReleaseId'),
            snapshotId: excluded('snapshotId'),
            isCurrent: true,
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
            updatedAt: excluded('updatedAt'),
          },
        })
        .run(),
    )
  }
}
