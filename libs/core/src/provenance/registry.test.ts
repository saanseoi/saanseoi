import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../testing/localDb'
import {
  objectKey,
  registerProcessingResult,
  retainProcessingResult,
  retainObject,
} from './index'
import type { Application, ProvenanceStore } from './types'

async function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE releases (id TEXT PRIMARY KEY, status TEXT NOT NULL, resourceType TEXT NOT NULL);
    CREATE TABLE releaseProvenance (releaseId TEXT PRIMARY KEY REFERENCES releases(id), manifestHash TEXT NOT NULL, byteLength INTEGER NOT NULL, applicationCount INTEGER NOT NULL, attemptStatus TEXT NOT NULL DEFAULT 'completed');
    INSERT INTO releases VALUES ('r', 'processing', 'address');`)
  const db = createLocalHarbourDb(sqlite)
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const result = await retainProcessingResult(store, {
    releaseId: 'r',
    collections: [],
    applications: [],
  })
  return { sqlite, db, store, ...result }
}

test('registry uses guarded SQL and identical registration writes no D1 rows', async () => {
  const f = await fixture()
  try {
    expect(
      (await registerProcessingResult(f.db, f.store, 'r', f.ref)).manifestHash,
    ).toBe(f.ref.hash)
    const before = f.sqlite.query('SELECT total_changes() AS n').get()
    await registerProcessingResult(f.db, f.store, 'r', f.ref)
    expect(f.sqlite.query('SELECT total_changes() AS n').get()).toEqual(before)
    f.sqlite.exec("UPDATE releases SET status='published'")
    await registerProcessingResult(f.db, f.store, 'r', f.ref)
    const changed = await retainObject(f.store, {
      ...f.manifest,
      collections: [
        {
          id: 's',
          layer: 'source',
          datasetCode: 'als',
          releaseId: 'r',
          snapshotId: null,
          schema: '1',
        },
      ],
    })
    await expect(registerProcessingResult(f.db, f.store, 'r', changed)).rejects.toThrow(
      'immutable',
    )
    expect(f.sqlite.query('SELECT manifestHash FROM releaseProvenance').get()).toEqual({
      manifestHash: f.ref.hash,
    })
  } finally {
    f.sqlite.close()
  }
})

test('identical registration does not re-read an already verified closure', async () => {
  const f = await fixture()
  try {
    const definition = await retainObject(f.store, { rule: 'fixture' })
    const application: Application = {
      schemaVersion: 1,
      kind: 'processing-application',
      id: 'fixture-application',
      operation: 'fixture-operation',
      operationVersion: 1,
      outcome: 'no-change',
      summary: 'Kept the fixture unchanged.',
      reason: 'The fixture already matched.',
      decision: {
        id: 'fixture-decision',
        revision: 1,
        origin: 'rule',
        review: 'unreviewed',
        definition,
      },
      inputs: [],
      effects: [],
      evidence: [],
      fields: [],
    }
    const result = await retainProcessingResult(f.store, {
      releaseId: 'r',
      collections: [],
      applications: [application],
    })
    await registerProcessingResult(f.db, f.store, 'r', result.ref)

    const manifestKey = objectKey(result.ref.hash)
    const retryStore: ProvenanceStore = {
      async get(key) {
        return key === manifestKey ? f.store.get(key) : null
      },
      async put(key, bytes) {
        return f.store.put(key, bytes)
      },
    }

    await expect(
      registerProcessingResult(f.db, retryStore, 'r', result.ref),
    ).resolves.toMatchObject({ manifestHash: result.ref.hash })
  } finally {
    f.sqlite.close()
  }
})

test('publication racing registration cannot insert or replace provenance', async () => {
  const f = await fixture()
  try {
    const racing = new Proxy(f.db, {
      get(target, key, receiver) {
        if (key === 'insert')
          return (...args: Parameters<typeof f.db.insert>) => {
            f.sqlite.exec("UPDATE releases SET status='published'")
            return target.insert(...args)
          }
        return Reflect.get(target, key, receiver)
      },
    })
    await expect(registerProcessingResult(racing, f.store, 'r', f.ref)).rejects.toThrow(
      'changed',
    )
    expect(f.sqlite.query('SELECT COUNT(*) AS n FROM releaseProvenance').get()).toEqual(
      { n: 0 },
    )
  } finally {
    f.sqlite.close()
  }
})

test('registry rejects mismatched ownership and Streets', async () => {
  const f = await fixture()
  try {
    const changed = await retainObject(f.store, {
      ...f.manifest,
      collections: [
        {
          id: 'c',
          layer: 'canonical',
          datasetCode: 'als',
          releaseId: 'other',
          snapshotId: 's',
          schema: '1',
        },
      ],
    })
    await expect(registerProcessingResult(f.db, f.store, 'r', changed)).rejects.toThrow(
      'different release',
    )
    await expect(
      registerProcessingResult(f.db, f.store, 'other', f.ref),
    ).rejects.toThrow('mismatch')
    f.sqlite.exec("UPDATE releases SET resourceType='street'")
    await expect(registerProcessingResult(f.db, f.store, 'r', f.ref)).rejects.toThrow(
      'Streets',
    )
  } finally {
    f.sqlite.close()
  }
})
