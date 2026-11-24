import { createHash } from 'node:crypto'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { historySchema } from '@repo/db'
import { loadMigrationSql } from '../testing/metaFixtures'
import {
  insertFixtureSnapshot,
  insertSnapshotProducerFixture,
} from '../testing/snapshotFixtures'
import { createLocalHarbourDb } from '../testing/localDb'
import type { ReplayShard } from '../pipeline/db/snapshotReplay'
import type { ExportSelection } from './contracts'

/** Real migrated metadata and HISTORY, paired with a deterministic in-memory R2 boundary. */
export function exportFixture() {
  const meta = new Database(':memory:')
  const history = new Database(':memory:')
  const migrations = resolve(import.meta.dir, '../../../db/migrations')
  meta.exec(loadMigrationSql(migrations, ['meta']))
  history.exec(loadMigrationSql(migrations, ['history']))
  meta.exec(
    `INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES('history','history','hk','2026','preview','fixture','fixture','history','active','fixture')`,
  )
  const db = createLocalHarbourDb(meta)
  const historyDb = drizzle({
    client: history,
    relations: defineRelations(historySchema),
  })
  const shards = new Map<string, ReplayShard>([
    ['history', { bindingName: 'history', db: historyDb as never }],
  ])
  const objects = new Map<
    string,
    { body: string; customMetadata?: Record<string, string> }
  >()
  const bucket = {
    async put(key: string, body: string, options: R2PutOptions) {
      const existing = objects.get(key)
      const condition = options?.onlyIf as R2Conditional | undefined
      if (existing && condition?.etagDoesNotMatch === '*') return null
      if (
        condition?.etagMatches &&
        (!existing ||
          createHash('sha256').update(existing.body).digest('hex') !==
            condition.etagMatches)
      )
        return null
      objects.set(key, { body, customMetadata: options.customMetadata })
      return { key }
    },
    async get(key: string, options?: { range: { offset: number; length: number } }) {
      const object = objects.get(key)
      if (!object) return null
      return {
        key,
        size: new TextEncoder().encode(object.body).length,
        customMetadata: object.customMetadata,
        httpEtag: '"fixture"',
        etag: createHash('sha256').update(object.body).digest('hex'),
        arrayBuffer: async () => new TextEncoder().encode(object.body).buffer,
        body: new Response(
          options?.range
            ? new TextEncoder()
                .encode(object.body)
                .slice(
                  options.range.offset,
                  options.range.offset + options.range.length,
                )
            : object.body,
        ).body,
        json: async () => JSON.parse(object.body),
        text: async () => object.body,
      }
    },
    async head(key: string) {
      const object = objects.get(key)
      return object
        ? {
            key,
            size: new TextEncoder().encode(object.body).length,
            customMetadata: object.customMetadata,
          }
        : null
    },
    async list({ prefix }: { prefix: string }) {
      return {
        objects: [...objects.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => ({ key })),
        truncated: false,
      }
    },
    async delete(keys: string[]) {
      for (const key of keys) objects.delete(key)
    },
  } as unknown as R2Bucket
  function snapshot(
    id: string,
    resourceType: string,
    parentSnapshotId: string | null = null,
  ) {
    insertFixtureSnapshot(meta, {
      id,
      code: id,
      resourceType,
      status: 'published',
      cohortKey: '2026',
      parentSnapshotId,
    })
    insertSnapshotProducerFixture(meta, id)
    meta
      .query('INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES(?,?)')
      .run(id, 'history')
  }
  function release(selection: ExportSelection, cohort: string, status = 'archived') {
    meta
      .query(
        "INSERT OR IGNORE INTO apiVersions(id,code,familyType,version,status,versionHash) VALUES(?,?,?,?, 'current','fixture')",
      )
      .run(
        selection.apiVersion,
        selection.apiVersion,
        selection.family,
        selection.apiVersion.split('-').at(-1)!,
      )
    meta
      .query(
        'INSERT INTO apiReleaseSets(id,code,regionCode,domainCode,cohortKey,revision,schemaVersion,rulesetVersion,versionHash) VALUES(?,?,?,?,?,0,?,?,?)',
      )
      .run(
        selection.apiReleaseSetId,
        selection.apiReleaseSetId,
        selection.region,
        selection.domain,
        cohort,
        'fixture',
        'fixture',
        'fixture',
      )
    meta
      .query(
        "INSERT INTO apiVersionReleaseSets(id,apiVersionId,apiReleaseSetId,status,versionHash) VALUES(?,?,?,?,'fixture')",
      )
      .run(
        selection.apiReleaseSetId,
        selection.apiVersion,
        selection.apiReleaseSetId,
        status,
      )
    for (const row of selection.snapshots)
      meta
        .query(
          "INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,variant,role,isRequired,cohortMatchingMode) VALUES(?,?,?,'primary',1,'exact_ref')",
        )
        .run(selection.apiReleaseSetId, row.snapshotId, row.variant)
  }
  return { meta, history, db, historyDb, shards, bucket, objects, snapshot, release }
}
