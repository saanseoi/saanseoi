import type { Database, SQLQueryBindings } from 'bun:sqlite'
import { join } from 'node:path'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addresses/normalisation'
import {
  currentSchema,
  eq,
  getTableColumns,
  getTableName,
  historySchema,
  metaSchema,
  sql,
} from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { addressMembershipMirrorFile } from '../../pipeline/addresses/addressMembershipBaseline.ts'
import { assertAddressProjectionMembership } from '../../pipeline/addresses/addressProjectionMembership.ts'
import { readAlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import {
  readExactProjectionRows,
  resolveValidatedProjectionVersions,
  type ProjectionComponent,
  type ProjectionHistoryTarget,
  type ProjectionRow,
} from './projectionReplay.ts'

export type ProjectionResourceType =
  | 'division'
  | 'divisionArea'
  | 'divisionBoundary'
  | 'address'
  | 'place'
  | 'street'
export type RestoreSnapshotProjectionInput = {
  /** Disposable isolated candidate, with no open transaction. */
  current: Database
  metaDb: HarbourReadableDb
  historyTargets: readonly ProjectionHistoryTarget[]
  snapshotId: string
  scopeId: string
  resourceType: ProjectionResourceType
  cacheDir?: string
}

const components: Record<ProjectionResourceType, ProjectionComponent[]> = {
  division: [
    { recordType: 'division', table: 'divisions', id: 'id' },
    {
      recordType: 'divisionI18n',
      table: 'divisionsI18n',
      id: 'divisionId',
      localised: true,
    },
  ],
  divisionArea: [{ recordType: 'divisionArea', table: 'divisionAreas', id: 'id' }],
  divisionBoundary: [
    { recordType: 'divisionBoundary', table: 'divisionBoundaries', id: 'id' },
  ],
  address: [
    { recordType: 'address2d', table: 'address2d', id: 'id' },
    {
      recordType: 'address2dI18n',
      table: 'address2dI18n',
      id: 'addressId',
      localised: true,
    },
    { recordType: 'address3d', table: 'address3d', id: 'id' },
    {
      recordType: 'address3dI18n',
      table: 'address3dI18n',
      id: 'address3dId',
      localised: true,
    },
  ],
  place: [
    { recordType: 'place', table: 'places', id: 'id' },
    { recordType: 'placeI18n', table: 'placesI18n', id: 'placeId', localised: true },
  ],
  street: [
    { recordType: 'street', table: 'streets', id: 'id' },
    { recordType: 'streetI18n', table: 'streetsI18n', id: 'streetId', localised: true },
    {
      recordType: 'streetChangelog',
      table: 'streetChangelog',
      id: 'versionHash',
      hashIdentity: true,
    },
  ],
}
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

export function insertProjectionRow(
  current: Database,
  name: string,
  row: ProjectionRow,
) {
  const table = currentSchema[name as keyof typeof currentSchema] as SQLiteTable
  if (!table) throw new Error(`Unknown current projection table ${name}.`)
  const columns = Object.values(getTableColumns(table))
  const values = columns.map(column => {
    const value = row[column.name]
    return value === undefined || value === null ? null : column.mapToDriverValue(value)
  }) as SQLQueryBindings[]
  current
    .query(
      `INSERT INTO ${quote(getTableName(table))} (${columns.map(column => quote(column.name)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    )
    .run(...values)
}

async function addressDependencies(input: RestoreSnapshotProjectionInput) {
  const assembly = await input.metaDb
    .select({ summary: metaSchema.metaSnapshotAssemblyRuns.selectionSummaryJson })
    .from(metaSchema.metaSnapshotAssemblyRuns)
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, input.snapshotId))
    .all()
  if (assembly.length !== 1)
    throw new Error(
      `Address snapshot ${input.snapshotId} requires one exact assembly selection.`,
    )
  const lookup = (
    assembly[0]?.summary as { lookupSnapshotIds?: Record<string, string> } | undefined
  )?.lookupSnapshotIds
  if (!lookup?.division)
    throw new Error(
      `Address snapshot ${input.snapshotId} has no recorded exact Division dependency.`,
    )
  const servingScope = (type: 'division' | 'street', snapshotId: string) => {
    const receipt = input.current
      .query<{ scopeId: string }, [string]>(
        `SELECT scopeId FROM ${type}PublicationState WHERE snapshotId=? AND status='current' AND preparedAt IS NOT NULL AND publicationToken<>''`,
      )
      .get(snapshotId)
    if (!receipt)
      throw new Error(
        `Rollback requires the complete exact ${type} dependency ${snapshotId} in current.`,
      )
    return receipt.scopeId
  }
  return {
    divisionSnapshotId: servingScope('division', lookup.division),
    streetSnapshotId: lookup.street ? servingScope('street', lookup.street) : null,
  }
}

async function addressMembership(input: RestoreSnapshotProjectionInput) {
  const sources = await input.metaDb
    .select({ code: metaSchema.metaDatasets.code })
    .from(metaSchema.metaSnapshotSources)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaSnapshotSources.snapshotId, input.snapshotId))
    .all()
  if (!sources.some(source => source.code === 'ds-hk-hkgov-dpo-address')) return null
  if (!input.cacheDir)
    throw new Error(
      'ALS rollback requires its acknowledged canonical membership sidecar.',
    )
  try {
    return await readAlsMembership(
      join(
        input.cacheDir,
        addressMembershipMirrorFile(input.scopeId, input.snapshotId),
      ),
    )
  } catch (cause) {
    throw new Error(
      'ALS rollback requires its acknowledged canonical membership sidecar.',
      { cause },
    )
  }
}

async function assertStreetSideTablesReconstructable(
  input: RestoreSnapshotProjectionInput,
) {
  const plan = await resolveSnapshotReplayPlan(input.metaDb, input.snapshotId)
  const snapshotIds = plan.map(step => step.snapshotId)
  for (const name of [
    'streetNameChanges',
    'streetNameChangeStreets',
    'streetGeometry',
  ] as const) {
    if (
      input.current
        .query(`SELECT 1 FROM ${name} WHERE snapshotId=? LIMIT 1`)
        .get(input.scopeId)
    )
      throw new Error(
        `Automatic Street rollback cannot reconstruct populated unjournalled ${name}.`,
      )
    for (const target of input.historyTargets) {
      const table = historySchema[name]
      if (
        await target.db
          .select()
          .from(table)
          .where(
            sql`${table.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))`,
          )
          .limit(1)
          .get()
      )
        throw new Error(
          `Automatic Street rollback cannot reconstruct populated unjournalled ${name}.`,
        )
    }
  }
}

function rebuildAddressBuildingNumbers(current: Database, scopeId: string) {
  const rows = current
    .query<
      {
        addressId: string
        buildingNumberConnector: string | null
        buildingNumberFrom: string | null
        buildingNumberTo: string | null
      },
      [string]
    >(
      'SELECT addressId,buildingNumberConnector,buildingNumberFrom,buildingNumberTo FROM address2dI18n WHERE snapshotId=?',
    )
    .all(scopeId)
  const timestamps = current.query<
    { createdAt: string; updatedAt: string },
    [string, string]
  >('SELECT createdAt,updatedAt FROM address2d WHERE snapshotId=? AND id=?')
  for (const row of buildAddressBuildingNumberLookupRows(rows)) {
    const times = timestamps.get(scopeId, row.addressId)
    if (!times) throw new Error(`Missing reconstructed Address owner ${row.addressId}.`)
    insertProjectionRow(current, 'address2dBuildingNumberLookup', {
      ...row,
      snapshotId: scopeId,
      ...times,
    })
  }
}

/** Check without cascades: unrelated serving scopes and logical references must survive. */
export function assertProjectionForeignKeys(current: Database) {
  const violations = current.query('PRAGMA foreign_key_check').all()
  if (violations.length)
    throw new Error(
      `Rollback projection would break retained dependencies: ${JSON.stringify(violations.slice(0, 5))}`,
    )
}

/**
 * Reconstruct exact logical membership only inside an isolated current candidate.
 * Publication claims, FTS, metadata and delivery are handled by the sealed planner.
 * History/source content is read-only; keyed delivery emits only the final differences.
 */
export async function restoreSnapshotProjection(input: RestoreSnapshotProjectionInput) {
  const selected = components[input.resourceType]
  const versions = await resolveValidatedProjectionVersions({
    ...input,
    recordTypes: selected.map(component => component.recordType),
  })
  const dependencies =
    input.resourceType === 'address' ? await addressDependencies(input) : null
  const membership =
    input.resourceType === 'address' ? await addressMembership(input) : null
  if (input.resourceType === 'street')
    await assertStreetSideTablesReconstructable(input)
  const tables = selected.map(component => component.table)
  if (input.resourceType === 'address') tables.push('address2dBuildingNumberLookup')
  if (input.resourceType === 'place') tables.push('placesCells', 'placesDivision')
  const counts: Record<string, number> = {}
  const foreignKeys =
    input.current.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
      ?.foreign_keys ?? 0
  if (input.current.inTransaction)
    throw new Error(
      'Rollback projection requires an isolated candidate outside a transaction.',
    )
  input.current.exec('PRAGMA foreign_keys=OFF')
  input.current.exec('BEGIN')
  try {
    for (const name of tables) {
      const scopeColumn = name === 'placesDivision' ? 'placeSnapshotId' : 'snapshotId'
      input.current
        .query(`DELETE FROM ${quote(name)} WHERE ${quote(scopeColumn)}=?`)
        .run(input.scopeId)
      counts[name] = 0
    }
    const activeStreetVersions = new Map<string, string>()
    const changelogOrder = new Map(
      [...versions.values()]
        .filter(version => version.recordType === 'streetChangelog')
        .map((version, index) => [version.versionHash, index]),
    )
    const changelog = new Map<string, { order: number; row: ProjectionRow }>()
    for (const component of selected) {
      for await (const rows of readExactProjectionRows(component, versions.values())) {
        for (const row of rows) {
          if (input.resourceType === 'street') {
            if (component.table === 'streets') {
              if (row.status !== 'active') continue
              activeStreetVersions.set(String(row.id), String(row.versionHash))
            } else if (component.table === 'streetsI18n') {
              if (activeStreetVersions.get(String(row.streetId)) !== row.versionHash)
                continue
            } else if (!activeStreetVersions.has(String(row.streetId))) continue
          }
          const restored = { ...row, snapshotId: input.scopeId }
          if (component.localised && input.resourceType !== 'street') {
            const owner =
              component.table === 'address3dI18n' ? 'address3d' : selected[0]?.table
            if (
              !owner ||
              !input.current
                .query(`SELECT 1 FROM ${quote(owner)} WHERE snapshotId=? AND id=?`)
                .get(input.scopeId, row[component.id] as SQLQueryBindings)
            )
              continue
          }
          if (component.table === 'streetChangelog') {
            const key = JSON.stringify([row.streetId, row.recordKey])
            const order = changelogOrder.get(String(row.versionHash)) ?? -1
            const previous = changelog.get(key)
            if (!previous || order > previous.order)
              changelog.set(key, { order, row: restored })
            continue
          }
          if (component.table === 'address2d' && dependencies) {
            Object.assign(restored, dependencies, {
              streetSnapshotId: row.streetId ? dependencies.streetSnapshotId : null,
            })
            if (row.streetId && !dependencies.streetSnapshotId)
              throw new Error(
                `Address ${row.id} has an unrecorded exact Street dependency.`,
              )
          }
          insertProjectionRow(input.current, component.table, restored)
          counts[component.table] = (counts[component.table] ?? 0) + 1
        }
      }
    }
    for (const { row } of changelog.values()) {
      insertProjectionRow(input.current, 'streetChangelog', row)
      counts.streetChangelog = (counts.streetChangelog ?? 0) + 1
    }
    if (input.resourceType === 'address') {
      rebuildAddressBuildingNumbers(input.current, input.scopeId)
      counts.address2dBuildingNumberLookup =
        input.current
          .query<{ count: number }, [string]>(
            'SELECT count(*) AS count FROM address2dBuildingNumberLookup WHERE snapshotId=?',
          )
          .get(input.scopeId)?.count ?? 0
      if (membership)
        assertAddressProjectionMembership(input.current, input.scopeId, membership)
    }
    assertProjectionForeignKeys(input.current)
    input.current.exec('COMMIT')
  } catch (error) {
    input.current.exec('ROLLBACK')
    throw error
  } finally {
    input.current.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}`)
  }
  return { tables, counts }
}
