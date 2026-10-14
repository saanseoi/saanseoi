import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { readObject } from '@repo/core/provenance'
import { createMemoryProvenanceStore } from '../../../../../../libs/core/src/testing/provenanceStore'
import {
  placeIdentityDeclaration,
  matchPlaceIdentities,
  placeIdentityEvidence,
} from '@repo/core/pipeline/services/places/placeIdentity'
import { retainProducerAudit } from '../../api/producerAudit'
import { hydratePlaceIdentityHistory } from './placeIdentityHistory'
import { previousPlaceIdentity } from './placeIdentityPreparation'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'

async function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    'CREATE TABLE processingAudits(resourceReleaseId,stage,ownerId,manifestHash,byteLength,applicationCount,attemptStatus)',
  )
  const db = drizzle({ client: sqlite })
  const { store } = createMemoryProvenanceStore()
  const identity = matchPlaceIdentities(
    [
      placeIdentityEvidence(
        { id: 'publisher-place', names: { primary: 'Cafe' }, phones: ['23456789'] },
        114,
        22,
      ),
    ],
    [],
    'scope',
    '2025-09-24.0',
  )[0]!
  const retained = await retainProducerAudit(store, {
    scope: { stage: 'assembly', ownerId: 'snapshot' },
    resourceReleaseId: 'release',
    datasetCode: 'ds-hk-overture-place',
    guards: [],
    rules: [
      {
        declaration: placeIdentityDeclaration,
        inputs: { places: 1 },
        outputs: { places: 1 },
        recordsAffected: 1,
        decisions: { new: 1 },
        fixtures: [
          {
            type: 'place-identity-decisions',
            document: { entries: [identity] },
            arrayKey: 'entries',
          },
        ],
      },
    ],
  })
  await db
    .insert(metaSchema.processingAudits)
    .values({
      resourceReleaseId: 'release',
      stage: 'assembly',
      ownerId: 'snapshot',
      manifestHash: retained.ref.hash,
      byteLength: retained.ref.byteLength,
      applicationCount: 0,
      attemptStatus: 'completed',
    })
    .run()
  const state = {
    bindingName: 'history',
    row: {
      id: identity.id,
      resourceReleaseId: 'release',
      snapshotId: 'snapshot',
      sources: [],
    },
  } as unknown as PlaceHistoryState
  return { sqlite, db: db as unknown as HarbourReadableDb, store, state, identity }
}

test('predecessor matching uses exact retained private identity evidence with flat public attribution', async () => {
  const f = await fixture()
  try {
    await hydratePlaceIdentityHistory(f.db, [f.state], ref => readObject(f.store, ref))
    expect(f.state.identity).toEqual(f.identity)
    expect(previousPlaceIdentity(f.state).evidence).toEqual(f.identity.evidence)
    expect(previousPlaceIdentity(f.state).evidence.sourceId).toBe('publisher-place')
    expect(f.state.row.sources).toEqual([])
  } finally {
    f.sqlite.close()
  }
})

test('missing exact owner audits and incomplete identity evidence block predecessor reuse', async () => {
  const f = await fixture()
  try {
    const wrong = { ...f.state, row: { ...f.state.row, snapshotId: 'unrelated' } }
    await expect(
      hydratePlaceIdentityHistory(f.db, [wrong], ref => readObject(f.store, ref)),
    ).rejects.toThrow('Missing completed Place identity audit')
    const missing = { ...f.state, row: { ...f.state.row, id: 'missing' } }
    await expect(
      hydratePlaceIdentityHistory(f.db, [missing], ref => readObject(f.store, ref)),
    ).rejects.toThrow('Incomplete retained Place identity decisions')
    await expect(
      hydratePlaceIdentityHistory(f.db, [f.state], async ref => ({
        ...((await readObject(f.store, ref)) as object),
        resourceReleaseId: 'different',
      })),
    ).rejects.toThrow('Place identity audit owner mismatch')
  } finally {
    f.sqlite.close()
  }
})
