import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { materialiseSupplementaryAddressHistory } from './supplementaryAddressHistory.ts'
import {
  type SupplementaryValues,
  supplementaryIdentity,
} from './supplementaryPlaceAddress.ts'
import { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'

test.each(['scope-a', 'scope-b'] as const)(
  'independent roots store events and children inherit until withdrawal (%s first)',
  async firstOwner => {
    const meta = new Database(':memory:')
    meta.exec(
      `CREATE TABLE snapshots(id PRIMARY KEY,parentSnapshotId); CREATE TABLE dataShards(id PRIMARY KEY,bindingName); CREATE TABLE snapshotShardAssignments(snapshotId,dataShardId); INSERT INTO dataShards VALUES('DB_HISTORY_HK_2025','DB_HISTORY_HK_2025'),('DB_HISTORY_HK_2026','DB_HISTORY_HK_2026');`,
    )
    const current = new Database(':memory:')
    const old = new Database(':memory:')
    const next = new Database(':memory:')
    try {
      for (const [db, profile] of [
        [current, 'current'],
        [old, 'history'],
        [next, 'history'],
      ] as const)
        db.exec(
          loadMigrationSql(
            resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
            [profile],
          ),
        )
      const values: SupplementaryValues[] = [
        {
          locale: 'en',
          formattedAddress: 'Pavilion, 20 Example Road',
          buildingName: 'Pavilion',
          streetName: 'Example Road',
        },
        {
          locale: 'zh-hant',
          formattedAddress: '示例路20號涼亭',
          buildingName: '涼亭',
          streetName: '示例路',
        },
      ].map(value => ({
        ...value,
        buildingNumberExpression: '20',
        buildingNumberFrom: '20',
        buildingNumberTo: null,
        blockExpression: null,
        phaseExpression: null,
        estateName: null,
      }))
      const identity = supplementaryIdentity(values)
      const addresses = await buildSupplementaryAddressRows({
        resolutions: [
          {
            placeId: 'place',
            sourceTexts: ['Pavilion, 20 Example Road'],
            fingerprint: 'publisher-fingerprint',
            tier: 'supplementary',
            addressId: identity.addressId,
            previous: null,
            candidates: [],
            reason: 'curated',
            parsed: [],
            entry: {
              ...identity,
              placeId: 'place',
              fingerprint: 'publisher-fingerprint',
              normalisedPublisherAddress: ['PAVILION, 20 EXAMPLE ROAD'],
              baseAddressId: null,
              values,
              policyVersion: 'supplementary-v1',
              score: 0,
              evidence: [],
              acceptanceMode: 'curated',
              firstSeen: '2025-12-17.0',
            },
          },
        ],
        officialAddresses: new Map(),
        snapshotId: 'a-first',
        divisionSnapshotId: 'division',
        sourceVersion: '2025-12-17.0',
        datasetCode: 'ds-hk-overture-place',
      })
      const candidates = {
        DB_META: { db: meta },
        DB_CURRENT: { db: current },
        DB_HISTORY_HK_2025: { db: old },
        DB_HISTORY_HK_2026: { db: next },
      }
      const publish = async (
        scopeId: string,
        snapshotId: string,
        scopeSnapshotIds: string[],
        selected = addresses,
        historyBinding = 'DB_HISTORY_HK_2026',
      ) => {
        meta
          .query('INSERT INTO snapshots VALUES(?,?)')
          .run(snapshotId, scopeSnapshotIds.at(-1) ?? null)
        meta
          .query('INSERT INTO snapshotShardAssignments VALUES(?,?)')
          .run(snapshotId, historyBinding)
        const owners = await materialiseSupplementaryAddressHistory({
          candidates,
          addresses: selected,
          scopeId,
          scopeSnapshotIds,
          snapshotId,
          resourceReleaseId: `release-${snapshotId}`,
          historyBinding,
          revokedAddressIds: selected.length ? [] : [identity.addressId],
          now: historyBinding.endsWith('2025')
            ? '2025-12-17T00:00:00Z'
            : '2026-01-21T00:00:00Z',
        })
        current
          .query(`INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
        VALUES(?,?,'publishing',?,'2026-01-21T00:00:00Z')
        ON CONFLICT(scopeId) DO UPDATE SET snapshotId=excluded.snapshotId,status=excluded.status,publicationToken=excluded.publicationToken,preparedAt=excluded.preparedAt`)
          .run(scopeId, snapshotId, `token-${snapshotId}`)
        return owners
      }
      const tables = ['address2d', 'address2dI18n', 'address2dBuildingNumberLookup']
      const components = (db: Database) =>
        tables.map(table =>
          db.query<Record<string, unknown>, []>(`SELECT * FROM ${table}`).all(),
        )
      await publish('scope-a', 'a-first', [], addresses, 'DB_HISTORY_HK_2025')
      const originalComponents = components(old)
      const originalCurrent = [
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
      ].map(table =>
        current
          .query<Record<string, unknown>, []>(
            `SELECT * FROM ${table} WHERE snapshotId='scope-a'`,
          )
          .all(),
      )
      expect(
        current
          .query('SELECT identifiers FROM address2d WHERE id=?')
          .get(identity.addressId),
      ).toEqual({ identifiers: null })
      expect(originalComponents.map(rows => rows.length)).toEqual([1, 2, 1])
      expect(
        current
          .query("SELECT count(*) AS n FROM address2d WHERE snapshotId='scope-b'")
          .get(),
      ).toEqual({ n: 0 })
      const owners = await publish('scope-b', 'b-first', [])
      expect(owners).toEqual(new Set(['DB_HISTORY_HK_2026']))
      expect(components(old)).toEqual(originalComponents)
      expect(components(next).map(rows => rows.length)).toEqual([1, 2, 1])
      expect(
        ['address2d', 'address2dI18n', 'address2dBuildingNumberLookup'].map(table =>
          current.query(`SELECT * FROM ${table} WHERE snapshotId='scope-b'`).all(),
        ),
      ).toEqual(
        originalCurrent.map(rows =>
          rows.map(row => ({
            ...row,
            snapshotId: 'scope-b',
            createdAt: '2026-01-21T00:00:00Z',
            updatedAt: '2026-01-21T00:00:00Z',
          })),
        ),
      )
      expect(
        next
          .query(
            "SELECT recordType,operation FROM historyEvents WHERE snapshotId='b-first' ORDER BY recordType",
          )
          .all(),
      ).toEqual([
        { recordType: 'address2d', operation: 'upsert' },
        { recordType: 'address2dBuildingNumberLookup', operation: 'upsert' },
        { recordType: 'address2dI18n', operation: 'upsert' },
        { recordType: 'address2dI18n', operation: 'upsert' },
      ])
      await publish('scope-b', 'b-second', ['b-first'], addresses)
      expect(components(old)).toEqual(originalComponents)
      const nextComponents = components(next)
      expect(nextComponents.map(rows => rows.length)).toEqual([1, 2, 1])
      const priorSnapshots = {
        'scope-a': ['a-first'],
        'scope-b': ['b-first', 'b-second'],
      }
      const lastOwner = firstOwner === 'scope-a' ? 'scope-b' : 'scope-a'
      await publish(firstOwner, `${firstOwner}-empty`, priorSnapshots[firstOwner], [])
      expect(components(old)).toEqual(originalComponents)
      expect(components(next)).toEqual(
        nextComponents.map((rows, i) => expect.arrayContaining(rows)),
      )
      expect(
        next
          .query(
            "SELECT count(*) AS n FROM historyEvents WHERE snapshotId=? AND operation='delete'",
          )
          .get(`${firstOwner}-empty`),
      ).toEqual({ n: 4 })
      expect(current.query('SELECT snapshotId FROM address2d').all()).toEqual([
        { snapshotId: lastOwner },
      ])
      await publish(lastOwner, `${lastOwner}-empty`, priorSnapshots[lastOwner], [])
      expect(components(old)).toEqual(originalComponents)
      expect(components(next)).toEqual(
        nextComponents.map(rows => expect.arrayContaining(rows)),
      )
      expect(current.query('SELECT * FROM address2d').all()).toEqual([])
      expect(current.query('SELECT * FROM address2dI18n').all()).toEqual([])
      expect(
        current.query('SELECT * FROM address2dBuildingNumberLookup').all(),
      ).toEqual([])
    } finally {
      meta.close()
      current.close()
      old.close()
      next.close()
    }
  },
)
