import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay'
import {
  currentSchema,
  historySchema,
  eq,
  and,
  or,
  getTableColumns,
  getTableName,
} from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import { readAddressDivisionSnapshotId } from './placeSnapshotDependencies.ts'

const tables = {
  address2d: currentSchema.address2d,
  address2dI18n: currentSchema.address2dI18n,
  address3d: currentSchema.address3d,
  address3dI18n: currentSchema.address3dI18n,
  divisions: currentSchema.divisions,
  divisionsI18n: currentSchema.divisionsI18n,
  addressPublicationState: currentSchema.addressPublicationState,
  divisionPublicationState: currentSchema.divisionPublicationState,
}
const components = [
  ['address2d', 'address2d', 'id'],
  ['address2dI18n', 'address2dI18n', 'addressId'],
  ['address3d', 'address3d', 'id'],
  ['address3dI18n', 'address3dI18n', 'address3dId'],
  ['division', 'divisions', 'id'],
  ['divisionI18n', 'divisionsI18n', 'divisionId'],
] as const
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

/** Disposable, disk-backed exact dependencies. This database is never a delivery target. */
export class PlaceDependencyView {
  readonly db: HarbourReadableDb
  private readonly snapshots = new Set<string>()
  private constructor(
    private readonly sqlite: Database,
    private readonly directory: string,
    private readonly metaDb: HarbourReadableDb,
    private readonly shards: ReadonlyMap<string, ReplayShard>,
  ) {
    this.db = drizzle({ client: sqlite }) as unknown as HarbourReadableDb
    for (const table of Object.values(tables)) {
      const columns = Object.values(getTableColumns(table))
      // Dependency views deliberately have no serving foreign keys or triggers.
      sqlite.exec(
        `CREATE TABLE ${quote(getTableName(table))} (${columns.map(column => `${quote(column.name)} ${column.getSQLType()}`).join(',')})`,
      )
    }
    for (const [, name, id] of components)
      sqlite.exec(
        `CREATE INDEX ${quote(`${name}_dependency_idx`)} ON ${quote(name)} (snapshotId,${quote(id)})`,
      )
    sqlite.exec(
      'CREATE INDEX address3d_owner_dependency_idx ON address3d(snapshotId,address2dId)',
    )
  }

  static async create(input: {
    metaDb: HarbourReadableDb
    historyTargets: readonly { bindingName: string; db: unknown }[]
  }) {
    const directory = await mkdtemp(join(tmpdir(), 'place-dependencies-'))
    let sqlite: Database | undefined
    try {
      sqlite = new Database(join(directory, 'dependencies.sqlite'))
      return new PlaceDependencyView(
        sqlite,
        directory,
        input.metaDb,
        new Map(
          input.historyTargets.map(target => [
            target.bindingName,
            {
              bindingName: target.bindingName,
              db: target.db as HarbourReadableDb,
            },
          ]),
        ),
      )
    } catch (error) {
      sqlite?.close()
      await rm(directory, { recursive: true, force: true })
      throw error
    }
  }

  async prepare(addressSnapshotId: string) {
    if (this.snapshots.has(addressSnapshotId)) return this.db
    this.sqlite.exec('BEGIN')
    try {
      const divisionSnapshotId = await readAddressDivisionSnapshotId(
        this.metaDb,
        addressSnapshotId,
      )
      if (!this.snapshots.has(divisionSnapshotId)) {
        await this.hydrate(divisionSnapshotId, ['division', 'divisionI18n'])
        this.receipt('divisionPublicationState', divisionSnapshotId)
      }
      await this.hydrate(
        addressSnapshotId,
        ['address2d', 'address2dI18n', 'address3d', 'address3dI18n'],
        divisionSnapshotId,
      )
      this.receipt('addressPublicationState', addressSnapshotId)
      this.sqlite.exec('COMMIT')
      this.snapshots.add(divisionSnapshotId)
      this.snapshots.add(addressSnapshotId)
      return this.db
    } catch (error) {
      if (this.sqlite.inTransaction) this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  private receipt(
    table: 'addressPublicationState' | 'divisionPublicationState',
    snapshotId: string,
  ) {
    this.insert(tables[table], {
      scopeId: snapshotId,
      snapshotId,
      status: 'current',
      publicationToken: `dependency:${snapshotId}`,
      preparedAt: 'dependency',
      createdAt: 'dependency',
      updatedAt: 'dependency',
    })
  }

  private insert(table: SQLiteTable, row: Record<string, unknown>) {
    const columns = Object.values(getTableColumns(table))
    const values = columns.map(column => {
      const value = row[column.name]
      return value === undefined || value === null
        ? null
        : column.mapToDriverValue(value)
    })
    this.sqlite
      .query(
        `INSERT INTO ${quote(getTableName(table))} (${columns.map(column => quote(column.name)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      )
      .run(...(values as never[]))
  }

  private async hydrate(
    snapshotId: string,
    types: readonly string[],
    divisionSnapshotId?: string,
  ) {
    const plan = await resolveSnapshotReplayPlan(this.metaDb, snapshotId)
    const state = await resolveSnapshotVersionState(plan, this.shards, types)
    for (const [type, name, id] of components) {
      if (!types.includes(type)) continue
      const groups = new Map<string, ResolvedSnapshotVersion[]>()
      for (const version of state.values()) {
        if (version.recordType !== type) continue
        const group = groups.get(version.shard.bindingName) ?? []
        group.push(version)
        groups.set(version.shard.bindingName, group)
      }
      const table = historySchema[name]
      const columns = getTableColumns(table as SQLiteTable)
      const localised = type.endsWith('I18n')
      const batchSize = getMaxItemsPerInClause(localised ? 3 : 2)
      for (const versions of groups.values()) {
        for (let start = 0; start < versions.length; start += batchSize) {
          const selected = versions.slice(start, start + batchSize)
          const first = selected[0]
          if (!first) continue
          const expected = new Set(
            selected.map(version =>
              JSON.stringify([version.recordId, version.locale, version.versionHash]),
            ),
          )
          const rows = await first.shard.db
            .select()
            .from(table)
            .where(
              or(
                ...selected.map(version =>
                  and(
                    eq(columns[id]!, version.recordId),
                    eq(table.versionHash, version.versionHash),
                    ...(localised ? [eq(columns.locale!, version.locale)] : []),
                  ),
                ),
              ),
            )
            .all()
          const found = new Set<string>()
          this.sqlite.transaction(() => {
            for (const row of rows as unknown as Record<string, unknown>[]) {
              const key = JSON.stringify([row[id], row.locale ?? '', row.versionHash])
              if (!expected.has(key)) continue
              found.add(key)
              this.insert(tables[name], {
                ...row,
                snapshotId,
                ...(name === 'address2d'
                  ? { divisionSnapshotId, streetSnapshotId: null }
                  : {}),
              })
            }
          })()
          if (found.size !== expected.size)
            throw new Error(
              `Dependency replay is missing ${type} content for ${snapshotId}.`,
            )
        }
      }
    }
  }

  async close() {
    this.sqlite.close()
    await rm(this.directory, { recursive: true, force: true })
  }
}
