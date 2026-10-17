import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { executeSqlText } from '../local/sqlImport.ts'
import { deliverResolvedAddressSqlPhase } from './resolvedAddressSqlPhase.ts'

test('supplementary Address native delivery resolves guarded net changes and resumes exact receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'address-publication-native-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  const meta = new Database(':memory:')
  meta.exec(
    "CREATE TABLE snapshotDependencies(snapshotId,role,dependencySnapshotId); INSERT INTO snapshotDependencies VALUES('new','division','division')",
  )
  const binding = createLocalExecBinding(db, 'DB_CURRENT')
  const context = {
    metaDb: createLocalHarbourDb(meta),
    currentBinding: binding,
    state: {
      target: 'local',
      files: { DB_CURRENT: path },
      dbCacheDir: root,
      bindings: { DB_CURRENT: { databaseId: 'configured-database-id' } },
    },
  } as unknown as LocalAddressDbContext
  const phase = {
    context,
    resourceReleaseId: `address-publication-test-${crypto.randomUUID()}`,
    phase: 'places-address-publication-data',
    inputs: { hash: 'fixed' },
    scopeId: 'scope',
    snapshotId: 'new',
    expectedCount: 1,
  }
  try {
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    db.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('division','division','current','dt','ready');
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,divisionSnapshotId) VALUES ('scope','old','current','old-token','prepared','division');
      INSERT INTO address2d(scopeId,id,divisionSnapshotId) VALUES ('scope','a','division');
      INSERT INTO address2dI18n(scopeId,addressId,locale,formattedAddress) VALUES ('scope','a','en','Example address');`)
    await deliverResolvedAddressSqlPhase(phase, async () => {
      await executeSqlText(
        { binding, databaseId: 'configured-database-id', name: 'current' },
        "UPDATE address2dI18n SET buildingNumberFrom = '1' WHERE scopeId = 'scope'; INSERT INTO address2dBuildingNumberLookup(scopeId,addressId,buildingNumber,numericStem,evidence) VALUES ('scope','a','1','1','source_endpoint');",
        { isLocal: true },
      )
      expect(db.query('SELECT buildingNumberFrom FROM address2dI18n').get()).toEqual({
        buildingNumberFrom: null,
      })
    })
    expect(
      db
        .query(
          'SELECT snapshotId,status,preparedAt IS NOT NULL AS complete FROM addressPublicationState WHERE scopeId="scope"',
        )
        .get(),
    ).toEqual({ snapshotId: 'new', status: 'publishing', complete: 1 })
    expect(db.query('SELECT buildingNumberFrom FROM address2dI18n').get()).toEqual({
      buildingNumberFrom: '1',
    })
    await deliverResolvedAddressSqlPhase(phase, async () => {
      throw new Error('Must resume retained plan')
    })
    expect(
      db.query('SELECT count(*) AS n FROM address2dBuildingNumberLookup').get(),
    ).toEqual({ n: 1 })
  } finally {
    meta.close()
    db.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(phase)), {
      recursive: true,
      force: true,
    })
  }
})
