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
  const binding = createLocalExecBinding(db, 'DB_CURRENT')
  const context = {
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
    releaseId: `address-publication-test-${crypto.randomUUID()}`,
    phase: 'places-address-publication-data',
    inputs: { hash: 'fixed' },
    scopeId: 'scope',
    snapshotId: 'new',
    expectedCount: 1,
  }
  try {
    const timestamps =
      "createdAt TEXT NOT NULL DEFAULT 'old',updatedAt TEXT NOT NULL DEFAULT 'old'"
    db.exec(`CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT NOT NULL,
      publicationToken TEXT NOT NULL,preparedAt TEXT,${timestamps});
      CREATE TABLE address2d(snapshotId TEXT,id TEXT,parentAddressId TEXT,${timestamps},PRIMARY KEY(snapshotId,id));
      CREATE TABLE address2dI18n(snapshotId TEXT,addressId TEXT,locale TEXT,formattedAddress TEXT,buildingName TEXT,estateName TEXT,streetName TEXT,phaseName TEXT,blockExpression TEXT,buildingNumberFrom TEXT,buildingNumberTo TEXT,buildingNumberConnector TEXT,${timestamps},PRIMARY KEY(snapshotId,addressId,locale));
      CREATE TABLE address2dBuildingNumberLookup(snapshotId TEXT,addressId TEXT,buildingNumber TEXT,numericStem TEXT,evidence TEXT,derivation TEXT,${timestamps},PRIMARY KEY(snapshotId,addressId,buildingNumber));
      CREATE TABLE address3d(snapshotId TEXT,id TEXT,address2dId TEXT,unresolvedSectionIds TEXT,units TEXT,unitCount INTEGER,${timestamps},PRIMARY KEY(snapshotId,id));
      CREATE TABLE address3dI18n(snapshotId TEXT,address3dId TEXT,locale TEXT,units TEXT,${timestamps},PRIMARY KEY(snapshotId,address3dId,locale));
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES ('scope','old','current','old-token','prepared');
      INSERT INTO address2d(snapshotId,id) VALUES ('scope','a');
      INSERT INTO address2dI18n(snapshotId,addressId,locale,formattedAddress) VALUES ('scope','a','en','Example address');`)
    await deliverResolvedAddressSqlPhase(phase, async () => {
      await executeSqlText(
        { binding, databaseId: 'configured-database-id', name: 'current' },
        "UPDATE address2dI18n SET buildingNumberFrom = '1' WHERE snapshotId = 'scope'; INSERT INTO address2dBuildingNumberLookup(snapshotId,addressId,buildingNumber,numericStem,evidence) VALUES ('scope','a','1','1','source_endpoint');",
        { isLocal: true },
      )
      expect(db.query('SELECT buildingNumberFrom FROM address2dI18n').get()).toEqual({
        buildingNumberFrom: null,
      })
    })
    expect(
      db
        .query(
          'SELECT snapshotId,status,preparedAt IS NOT NULL AS complete FROM addressPublicationState',
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
    db.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(phase)), {
      recursive: true,
      force: true,
    })
  }
})
