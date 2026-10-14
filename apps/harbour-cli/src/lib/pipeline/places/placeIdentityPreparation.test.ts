import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serialise } from '@repo/core/provenance'
import {
  type NormalisedPlace,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import {
  canonicalAddressResolutions,
  previousPlaceIdentity,
  stagePlaceIdentities,
} from './placeIdentityPreparation'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation'
import { buildPlaceSql, buildPlaceSqlBatches } from './processLocalPlaceSqlUploadRows'
import type {
  BuildPlaceSqlInput,
  PlaceHistoryState,
} from './processLocalPlaceSqlUploadTypes'

const normalised = (id: string) =>
  normaliseOverturePlace(
    {
      id,
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      names: { primary: 'Cafe' },
      phones: ['23456789'],
      categories: { primary: 'cafe' },
      sources: [{ dataset: 'meta', record_id: '123' }],
    },
    '2026-01-01.0',
  )!
const history = (place: NormalisedPlace): PlaceHistoryState => ({
  bindingName: 'history',
  row: {
    ...place,
    createdAt: '2025-01-01',
    versionHash: 'before',
    resourceReleaseId: 'before',
    address2dId: null,
    addressSnapshotId: null,
  },
})

test('canonical source attribution preserves upstream identity matching evidence', () => {
  const state = history(normalised('canonical-place'))
  state.row.sources = [
    { publisher: 'meta', upstreamOf: 'overture', dataset: 'meta', recordId: '123' },
  ]
  expect(previousPlaceIdentity(state).evidence.attribution).toEqual([
    JSON.stringify(['meta', '123']),
  ])
})

test('preparation preserves raw publisher identity, deterministic births and retry evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-identity-'))
  try {
    const raw = normalised('source-new')
    const path = join(root, 'source.jsonl')
    await writeFile(path, `${JSON.stringify(raw)}\n`)
    const input = {
      sourcePath: path,
      historyRows: [],
      scope: 'hk-place',
      sourceVersion: '2026-01-01.0',
      releaseRoot: root,
      stagingRoot: join(root, 'curations'),
    }
    const first = await stagePlaceIdentities(input)
    const staged = (
      await Array.fromAsync(readStagedJsonLines<NormalisedPlace>(first.path))
    )[0]!
    expect(staged.id).toMatch(/^ss-/)
    expect(staged.raw).toEqual(raw.raw)
    expect(staged.sources.placeIdentity?.sourceId).toBe('source-new')
    const rerun = await stagePlaceIdentities({
      ...input,
      historyRows: [history(staged)],
    })
    expect(rerun.bySourceId.get('source-new')).toEqual(
      first.bySourceId.get('source-new'),
    )
    const persisted = history(staged)
    persisted.row.sources = []
    persisted.identity = JSON.parse(serialise(first.bySourceId.get('source-new')))
    const unchanged = await stagePlaceIdentities({
      ...input,
      sourceVersion: '2026-02-01.0',
      historyRows: [persisted],
    })
    expect(unchanged.bySourceId.get('source-new')).toEqual(
      first.bySourceId.get('source-new'),
    )
    await writeFile(path, `${JSON.stringify(normalised('source-replacement'))}\n`)
    const next = await stagePlaceIdentities({
      ...input,
      sourceVersion: '2026-02-01.0',
      historyRows: [history(staged)],
    })
    expect(next.bySourceId.get('source-replacement')?.id).toBe(staged.id)
    const resolutions = join(root, 'addresses.jsonl')
    await writeFile(
      resolutions,
      `${JSON.stringify({
        placeId: 'source-replacement',
        tier: 'delayed',
        addressId: null,
      })}\n`,
    )
    expect(
      (
        await Array.fromAsync(canonicalAddressResolutions(resolutions, next.bySourceId))
      )[0]?.placeId,
    ).toBe(staged.id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('SQL and batched omission use publisher IDs while canonical membership uses matched IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-identity-sql-'))
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE overturePlaces(sourceRecordId TEXT, properties TEXT, sourceGeometry TEXT, versionHash TEXT, resourceReleaseId TEXT, validFromRelease TEXT, validToRelease TEXT, isCurrent INTEGER, createdAt TEXT, updatedAt TEXT, PRIMARY KEY(sourceRecordId,versionHash,validFromRelease));
`)
    const place = { ...normalised('publisher-new'), id: 'canonical-retained' }
    const row = {
      place,
      sourcePayloadHash: 'after-source',
      versionHash: 'after-base',
      address2dId: null,
      address3dId: null,
      divisionIds: [],
    }
    const input: BuildPlaceSqlInput = {
      activeSourceBindingName: 'source',
      activeHistoryBindingName: 'history',
      sourceBindingNames: ['source'],
      datasetId: 'dataset',
      message: {
        sourceVersion: '2026-01-01.0',
        resourceReleaseId: 'release',
      } as BuildPlaceSqlInput['message'],
      snapshots: {
        snapshotId: 'snapshot',
        snapshotLineageId: 'scope',
        addressSnapshotId: 'address',
        divisionSnapshotId: 'division',
      },
      historyRows: [],
      places: [row],
    }
    input.sourceRows = new Map([
      ['publisher-old', { bindingName: 'source', versionHash: 'old' }],
    ])
    const generated = await buildPlaceSql(input)
    for (const sql of generated.sourceSqlByBinding.values()) db.exec(sql.join('\n'))
    expect(db.query('SELECT sourceRecordId FROM overturePlaces').all()).toEqual([
      { sourceRecordId: 'publisher-new' },
    ])
    const path = join(root, 'enriched.jsonl')
    await writeFile(path, `${JSON.stringify(row)}\n`)
    const batches = await Array.fromAsync(buildPlaceSqlBatches(input, path, 'now'))
    const final = [...batches.at(-1)!.sourceSqlByBinding.values()].flat().join('\n')
    expect(final).toContain('publisher-old')
    expect(final).not.toContain('publisher-new')
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
