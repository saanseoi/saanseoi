import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../testing/localDb'
import {
  objectKey,
  registerProcessingResult,
  retainProcessingResult,
  retainObject,
  retainAuditResult,
} from './index'
import type { Application, ProvenanceStore } from './types'

test('failed guard attempts remain registered and cannot masquerade as completed audits', async () => {
  const f = await fixture()
  try {
    const result = await retainAuditResult(f.store, {
      scope: { stage: 'ingestion', ownerId: 'r' },
      resourceReleaseId: 'r',
      datasetCode: 'divisions',
      attempt: { id: 'failed-attempt', status: 'failed' },
      bulk: [],
      individuals: [],
      guards: [
        {
          id: 'source-guard',
          summary: 'Require reviewed source classification.',
          consequence: 'block-ingestion',
          status: 'failed',
          checked: 1,
          failed: 1,
          reason: 'Source drift requires review.',
        },
      ],
    })
    const saved = await registerProcessingResult(f.db, f.store, 'r', result.ref)
    expect(saved.attemptStatus).toBe('failed')
    expect(saved.manifestHash).toBe(result.ref.hash)
    await expect(
      retainAuditResult(f.store, {
        ...result.manifest,
        individuals: [],
        attempt: { id: 'invalid', status: 'completed' },
      }),
    ).rejects.toThrow()
    expect(f.sqlite.query('SELECT attemptStatus FROM processingAudits').get()).toEqual({
      attemptStatus: 'failed',
    })
  } finally {
    f.sqlite.close()
  }
})

async function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE resourceReleases (id TEXT PRIMARY KEY, status TEXT NOT NULL, resourceType TEXT NOT NULL, code TEXT);
    CREATE TABLE releaseProvenance (resourceReleaseId TEXT PRIMARY KEY REFERENCES resourceReleases(id), manifestHash TEXT NOT NULL, byteLength INTEGER NOT NULL, applicationCount INTEGER NOT NULL, attemptStatus TEXT NOT NULL DEFAULT 'completed');
    CREATE TABLE processingAudits(resourceReleaseId TEXT NOT NULL, stage TEXT NOT NULL, ownerId TEXT NOT NULL, manifestHash TEXT NOT NULL, byteLength INTEGER NOT NULL, applicationCount INTEGER NOT NULL, attemptStatus TEXT NOT NULL, PRIMARY KEY(resourceReleaseId,stage,ownerId));
    INSERT INTO resourceReleases VALUES ('r', 'processing', 'address', 'r');`)
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
    resourceReleaseId: 'r',
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
    f.sqlite.exec("UPDATE resourceReleases SET status='current'")
    await registerProcessingResult(f.db, f.store, 'r', f.ref)
    const changed = await retainObject(f.store, {
      ...f.manifest,
      collections: [
        {
          id: 's',
          layer: 'source',
          datasetCode: 'als',
          resourceReleaseId: 'r',
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
      resourceReleaseId: 'r',
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
            f.sqlite.exec("UPDATE resourceReleases SET status='current'")
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

test('registry rejects mismatched ownership', async () => {
  const f = await fixture()
  try {
    const changed = await retainObject(f.store, {
      ...f.manifest,
      collections: [
        {
          id: 'c',
          layer: 'canonical',
          datasetCode: 'als',
          resourceReleaseId: 'other',
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
  } finally {
    f.sqlite.close()
  }
})

test('registry verifies and registers a completed Street audit', async () => {
  const f = await fixture()
  try {
    f.sqlite.exec("UPDATE resourceReleases SET resourceType='street'")
    const result = await retainAuditResult(f.store, {
      scope: { stage: 'ingestion', ownerId: 'r' },
      resourceReleaseId: 'r',
      datasetCode: 'landsd-street',
      attempt: { id: 'street-attempt', status: 'completed' },
      bulk: [],
      individuals: [],
      guards: [
        {
          id: 'street-source-hashes',
          summary: 'Verify delivered source hashes.',
          consequence: 'block-ingestion',
          status: 'passed',
          checked: 1,
          failed: 0,
          reason: 'The delivered hash matches.',
        },
      ],
    })
    const saved = await registerProcessingResult(f.db, f.store, 'r', result.ref)
    expect(saved.attemptStatus).toBe('completed')
    expect(saved.manifestHash).toBe(result.ref.hash)
    await registerProcessingResult(f.db, f.store, 'r', result.ref)
  } finally {
    f.sqlite.close()
  }
})

test('audits require exact output membership and preserve distinct lifecycle stages', async () => {
  const f = await fixture()
  try {
    f.sqlite.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,status TEXT);
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT,resourceReleaseId TEXT);
      CREATE TABLE apiReleaseSets(id TEXT PRIMARY KEY);
      CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT,snapshotId TEXT);
      CREATE TABLE apiVersionReleaseSets(apiReleaseSetId TEXT,status TEXT);
      INSERT INTO snapshots VALUES ('s','draft'),('unrelated','draft');
      INSERT INTO snapshotResourceReleases VALUES ('s','r');
      INSERT INTO apiReleaseSets VALUES ('set');
      INSERT INTO apiReleaseSetSnapshots VALUES ('set','s');
      INSERT INTO apiVersionReleaseSets VALUES ('set','draft');`)
    const retain = (
      stage: 'preparation' | 'ingestion' | 'assembly' | 'composition',
      ownerId: string,
      id = 'attempt',
    ) =>
      retainAuditResult(f.store, {
        scope: { stage, ownerId },
        resourceReleaseId: 'r',
        datasetCode: 'divisions',
        attempt: { id, status: 'completed' },
        bulk: [],
        guards: [],
        individuals: [],
      })
    for (const [stage, owner] of [
      ['preparation', 'r'],
      ['ingestion', 'r'],
      ['assembly', 's'],
      ['composition', 'set'],
    ] as const) {
      const result = await retain(stage, owner)
      await registerProcessingResult(f.db, f.store, 'r', result.ref)
    }
    expect(f.sqlite.query('SELECT COUNT(*) AS n FROM processingAudits').get()).toEqual({
      n: 4,
    })
    for (const [stage, owner] of [
      ['preparation', 's'],
      ['assembly', 'unrelated'],
      ['composition', 'unknown'],
    ] as const) {
      const result = await retain(stage, owner)
      await expect(
        registerProcessingResult(f.db, f.store, 'r', result.ref),
      ).rejects.toThrow()
    }
    f.sqlite.exec(
      "UPDATE snapshots SET status='published'; UPDATE apiVersionReleaseSets SET status='current'",
    )
    for (const [stage, owner] of [
      ['assembly', 's'],
      ['composition', 'set'],
    ] as const) {
      const same = await retain(stage, owner)
      await registerProcessingResult(f.db, f.store, 'r', same.ref)
      const replacement = await retain(stage, owner, 'replacement')
      await expect(
        registerProcessingResult(f.db, f.store, 'r', replacement.ref),
      ).rejects.toThrow('published')
    }
  } finally {
    f.sqlite.close()
  }
})
