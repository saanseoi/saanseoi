import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { materialiseSupplementaryAddressHistory } from './supplementaryAddressHistory.ts'
import { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import {
  supplementaryIdentity,
  type SupplementaryValues,
} from './supplementaryPlaceAddress.ts'

test('a new lineage materialises shared components and closes them only after every current owner withdraws', async () => {
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
      sourceReleaseId: 'address-source',
      placeSourceReleaseId: 'place-source',
      sourceVersion: '2025-12-17.0',
      datasetId: 'dataset',
    })
    const candidates = {
      DB_CURRENT: { db: current },
      DB_HISTORY_HK_2025: { db: old },
      DB_HISTORY_HK_2026: { db: next },
    }
    const publish = (
      scopeId: string,
      snapshotId: string,
      scopeSnapshotIds: string[],
      selected = addresses,
      historyBinding = 'DB_HISTORY_HK_2026',
    ) =>
      materialiseSupplementaryAddressHistory({
        candidates,
        addresses: selected,
        scopeId,
        scopeSnapshotIds,
        snapshotId,
        releaseId: `release-${snapshotId}`,
        historyBinding,
        revokedAddressIds: selected.length ? [] : [identity.addressId],
        now: historyBinding.endsWith('2025')
          ? '2025-12-17T00:00:00Z'
          : '2026-01-21T00:00:00Z',
      })
    const tables = [
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
      'address2dEvidence',
    ]
    const components = (db: Database) =>
      tables.map(table => db.query(`SELECT * FROM ${table}`).all())
    await publish('scope-a', 'a-first', [], addresses, 'DB_HISTORY_HK_2025')
    const originalComponents = components(old)
    const originalCurrent = [
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
    ].map(table =>
      current.query(`SELECT * FROM ${table} WHERE snapshotId='scope-a'`).all(),
    )
    expect(originalComponents.map(rows => rows.length)).toEqual([1, 2, 1, 1])
    expect(
      current
        .query("SELECT count(*) AS n FROM address2d WHERE snapshotId='scope-b'")
        .get(),
    ).toEqual({ n: 0 })
    const owners = await publish('scope-b', 'b-first', [])
    expect(owners).toEqual(new Set(['DB_HISTORY_HK_2025', 'DB_HISTORY_HK_2026']))
    expect(components(old)).toEqual(originalComponents)
    expect(components(next)).toEqual([[], [], [], []])
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
      old
        .query(
          "SELECT recordType,operation FROM snapshotVersionChanges WHERE snapshotId='b-first' ORDER BY recordType",
        )
        .all(),
    ).toEqual([
      { recordType: 'address2d', operation: 'upsert' },
      { recordType: 'address2dEvidence', operation: 'upsert' },
      { recordType: 'address2dI18n', operation: 'upsert' },
      { recordType: 'address2dI18n', operation: 'upsert' },
    ])
    await publish('scope-a', 'a-empty', ['a-first'], [])
    expect(components(old)).toEqual(originalComponents)
    expect(current.query('SELECT snapshotId FROM address2d').all()).toEqual([
      { snapshotId: 'scope-b' },
    ])
    await publish('scope-b', 'b-empty', ['b-first'], [])
    expect(components(old)).toEqual(
      originalComponents.map(rows => rows.map(row => ({ ...row, isCurrent: 0 }))),
    )
    expect(current.query('SELECT * FROM address2d').all()).toEqual([])
    expect(current.query('SELECT * FROM address2dI18n').all()).toEqual([])
    expect(current.query('SELECT * FROM address2dBuildingNumberLookup').all()).toEqual(
      [],
    )
  } finally {
    current.close()
    old.close()
    next.close()
  }
})
