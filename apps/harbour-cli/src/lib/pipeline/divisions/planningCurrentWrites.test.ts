import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { currentSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  replaceCurrentSnapshot,
  replaceCurrentI18n,
  compressPlanningDivisionGeometry,
} from './processLocalHkgovPlandDivisionSqlUploadRows'
import { buildPlandCurrentSql } from './processLocalHkgovPlandDivisionSqlUploadSql'
import type { PreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadTypes'
import { reusePlanningCanonicalProvenance } from './planningCanonicalReuse'
import { createHash } from '@repo/core/pipeline/utils'

test('Planning canonical reuse and local/remote current delivery skip an unchanged publication', async () => {
  const mirror = new Database(':memory:')
  const remote = new Database(':memory:')
  for (const db of [mirror, remote]) {
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    db.exec('PRAGMA foreign_keys=ON')
    db.exec(`CREATE TABLE writes(operation TEXT,id TEXT);
      CREATE TRIGGER divisions_write AFTER INSERT ON divisions BEGIN INSERT INTO writes VALUES('insert',NEW.id); END;
      CREATE TRIGGER divisions_update AFTER UPDATE ON divisions BEGIN INSERT INTO writes VALUES('update',NEW.id); END;
      CREATE TRIGGER divisions_delete AFTER DELETE ON divisions BEGIN INSERT INTO writes VALUES('delete',OLD.id); END;
      CREATE TRIGGER names_write AFTER INSERT ON divisionsI18n BEGIN INSERT INTO writes VALUES('insert-locale',NEW.divisionId); END;
      CREATE TRIGGER names_update AFTER UPDATE ON divisionsI18n BEGIN INSERT INTO writes VALUES('update-locale',NEW.divisionId); END;`)
  }
  const db = drizzle({ client: mirror, schema: currentSchema })
  const make = (version: string): PreparedDivision => ({
    base: {
      id: 'one',
      divisionCode: null,
      category: null,
      class: 'planning-subunit',
      level: 6,
      wikidata: null,
      identifiers: null,
      cartography: null,
      bbox: null,
      hierarchies: { full: [], administrative: [], locality: [] },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 22],
          ],
        ],
      },
      sources: { hkgovPland: [{ sourceVersion: version, planningLevel: 'subunit' }] },
    },
    versionHash: version,
    i18n: [
      { locale: 'en', name: 'One' },
      { locale: 'zh-hant', name: '一' },
    ],
    cells: [],
    newTown: null,
    raw: { source_version: version },
    sourceCellIds: [],
  })
  const first = make('first')
  first.versionHash = await createHash({
    base: first.base,
    i18n: first.i18n.toSorted((a, b) => a.locale.localeCompare(b.locale)),
  })
  const compressed = compressPlanningDivisionGeometry([first], () => {})
  const publish = async (
    record: PreparedDivision,
    snapshotId: string,
    previous: string | null,
    changed: boolean,
  ) => {
    await replaceCurrentSnapshot(
      db as never,
      'lineage',
      [record],
      compressed,
      [],
      snapshotId,
      () => {},
    )
    await replaceCurrentI18n(db as never, 'lineage', [record], [], snapshotId, () => {})
    mirror
      .query(
        "INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,createdAt,updatedAt) VALUES('lineage',?,'publishing',?,?,?,?) ON CONFLICT(scopeId) DO UPDATE SET snapshotId=excluded.snapshotId,publicationToken=excluded.publicationToken,preparedAt=excluded.preparedAt",
      )
      .run(snapshotId, snapshotId, snapshotId, snapshotId, snapshotId)
    const file = await buildPlandCurrentSql({ currentDb: db } as never, {
      records: [record],
      snapshotId,
      releaseId: snapshotId,
      releaseCode: snapshotId,
      changedHistoryIds: changed ? ['one'] : [],
      changedCurrentBaseIds: changed ? ['one'] : [],
      changedNativeIds: [],
      missingHistoryIds: [],
      missingNativeIds: [],
      publication: {
        table: 'divisionPublicationState',
        scopeId: 'lineage',
        snapshotId,
        publicationToken: snapshotId,
        timestamp: snapshotId,
        previous: previous
          ? { snapshotId: previous, publicationToken: previous }
          : null,
      },
    })
    remote.exec(file)
  }
  try {
    await publish(first, 'first', null, true)
    expect(remote.query('SELECT count(*) AS n FROM writes').get()).toEqual({ n: 3 })
    const reissue = make('second')
    await reusePlanningCanonicalProvenance(
      [reissue],
      [
        {
          ...first.base,
          geometry: compressed.get('one'),
          versionHash: first.versionHash,
        },
      ],
    )
    expect(reissue.base.sources).toEqual(first.base.sources)
    expect(reissue.versionHash).toBe(first.versionHash)
    for (const client of [mirror, remote]) client.exec('DELETE FROM writes')
    await publish(reissue, 'second', 'first', false)
    expect(mirror.query('SELECT * FROM writes').all()).toEqual([])
    expect(remote.query('SELECT * FROM writes').all()).toEqual([])
    const renamed = {
      ...reissue,
      i18n: [{ locale: 'en', name: 'Revised' }, reissue.i18n[1]!],
    }
    await publish(renamed, 'third', 'second', false)
    expect(remote.query('SELECT * FROM writes').all()).toEqual([
      { operation: 'update-locale', id: 'one' },
    ])
  } finally {
    mirror.close()
    remote.close()
  }
})
