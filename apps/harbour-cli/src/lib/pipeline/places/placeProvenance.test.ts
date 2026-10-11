import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyAuditResult, readAuditPage } from '@repo/core/provenance'
import { readObject } from '../../../../../../libs/core/src/provenance/objects'
import { LocalPipelineBucket } from '../local/localBucket'
import { retainPlaceProvenance } from './placeProvenance'
import {
  parseSupplementaryCuration,
  type SupplementaryCuration,
} from './supplementaryPlaceAddress'
import policy from './testFixtures/supplementaryAddressPolicy.json'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('Places retain replayable reviewed decisions without adding automatic record audit rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-replay-provenance-'))
  directories.push(directory)
  const resolutionPath = join(directory, 'resolutions.jsonl')
  const decision = {
    placeId: 'replayed',
    sourceRelease: '2026-08',
    fingerprint: 'same',
    previousAddressId: null,
    resolution: 'leave_unlinked' as const,
    addressId: null,
    reason: 'Reviewed retirement.',
  }
  const fixture = {
    ...parseSupplementaryCuration(structuredClone(policy)),
    entries: [],
    decisions: [
      decision,
      { ...decision, sourceRelease: '2026-10' },
      { ...decision, placeId: 'not-observed' },
    ],
  }
  await writeFile(
    resolutionPath,
    `${JSON.stringify({
      placeId: 'replayed',
      fingerprint: 'same',
      tier: 'delayed',
      addressId: null,
    })}\n`,
  )
  const store = new LocalPipelineBucket(join(directory, 'objects'))
  const result = await retainPlaceProvenance(store, {
    snapshotId: 'test-snapshot',
    resourceReleaseId: 'release',
    datasetCode: 'ds-hk-overture-place',
    addresses: {
      snapshotId: 'test-snapshot',
      fixture,
      resolutionPath,
      sourceVersion: '2026-09',
      supplementaryCount: 0,
    },
  })
  const retained = result.manifest.bulk
    .flatMap(rule => rule.fixtures)
    .filter(value => value.type === 'place-address-decisions')
  expect(retained).toHaveLength(1)
  expect(await readObject(store, retained[0]!.object)).toMatchObject({
    decisions: [decision],
  })
  expect(result.manifest.applicationCount).toBe(0)
  expect(result.manifest.chunks).toHaveLength(0)
  await verifyAuditResult(store, result.manifest)
})

test('Places audit retains unresolved review evidence without claiming an applied decision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-provenance-'))
  directories.push(directory)
  const resolutionPath = join(directory, 'resolutions.jsonl')
  const fixture: SupplementaryCuration = {
    ...parseSupplementaryCuration(structuredClone(policy)),
    entries: [],
    decisions: [
      {
        placeId: 'reviewed',
        sourceRelease: '2026-09',
        fingerprint: 'fingerprint',
        previousAddressId: null,
        resolution: 'leave_unlinked',
        addressId: null,
        reason: 'No matching official premise.',
      },
    ],
  }
  await writeFile(
    resolutionPath,
    [
      {
        placeId: 'reviewed',
        fingerprint: 'fingerprint',
        tier: 'delayed',
        addressId: null,
      },
      {
        placeId: 'pending',
        fingerprint: 'pending',
        tier: 'review',
        addressId: null,
      },
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  const store = new LocalPipelineBucket(directory)
  const result = await retainPlaceProvenance(store, {
    snapshotId: 'test-snapshot',
    resourceReleaseId: 'place-release',
    datasetCode: 'places',
    addresses: {
      snapshotId: 'test-snapshot',
      fixture,
      resolutionPath,
      sourceVersion: '2026-09',
      supplementaryCount: 0,
    },
    staged: {
      path: 'unused',
      processedRows: 3,
      includedRows: 2,
      actions: [
        {
          action: 'overture_place_country_review_required',
          mode: 'automatic',
          affectedRecordCount: 1,
          summary: 'Excluded country.',
          evidence: { disposition: 'excluded', publisher: 'TRANSIENT_VALUE' },
        },
      ],
    },
  })
  await verifyAuditResult(store, result.manifest)
  expect(result.manifest.attempt.status).toBe('failed')
  expect(result.manifest.guards[0]).toMatchObject({
    failed: 1,
    checked: 2,
    status: 'failed',
  })
  expect(result.manifest.bulk[1]?.counts.decisions).toEqual({
    excluded: 1,
    included: 2,
  })
  expect(result.manifest.applicationCount).toBe(1)
  expect(await readAuditPage(store, result.manifest)).toMatchObject({
    rows: [
      {
        reason: 'No matching official premise.',
        record: { id: 'reviewed' },
        fixture: { pointer: '' },
      },
    ],
  })
})

test('automatic Place matching grows counts without generating per-record audit objects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-bulk-audit-'))
  directories.push(directory)
  const fixture = {
    ...parseSupplementaryCuration(structuredClone(policy)),
    entries: [],
    decisions: [],
  }
  const sizes: Array<{ objects: number; bytes: number }> = []
  for (const count of [10, 10000]) {
    const resolutionPath = join(directory, `resolutions-${count}.jsonl`)
    await writeFile(
      resolutionPath,
      Array.from({ length: count }, (_, i) =>
        JSON.stringify({
          placeId: `place-${i}`,
          fingerprint: `fingerprint-${i}`,
          tier: 'direct',
          addressId: `address-${i}`,
        }),
      ).join('\n'),
    )
    const objects = new Map<string, ArrayBuffer>()
    const store = {
      async get(key: string) {
        const bytes = objects.get(key)
        return bytes ? { arrayBuffer: async () => bytes } : null
      },
      async put(key: string, bytes: ArrayBuffer) {
        objects.set(key, bytes)
      },
    }
    const result = await retainPlaceProvenance(store, {
      snapshotId: 'test-snapshot',
      resourceReleaseId: 'release',
      datasetCode: 'places',
      addresses: {
        snapshotId: 'test-snapshot',
        fixture,
        resolutionPath,
        sourceVersion: '2026-09',
        supplementaryCount: 0,
      },
    })
    expect(result.manifest.applicationCount).toBe(0)
    expect(result.manifest.chunks).toHaveLength(0)
    expect(result.manifest.bulk[0]?.counts.decisions.direct).toBe(count)
    sizes.push({
      objects: objects.size,
      bytes: [...objects.values()].reduce(
        (total, bytes) => total + bytes.byteLength,
        0,
      ),
    })
  }
  expect(sizes[1]!.objects).toBe(sizes[0]!.objects)
  expect(sizes[1]!.bytes - sizes[0]!.bytes).toBeLessThan(100)
})

test('deferred investigations pass the review gate without claiming a resolved identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-deferred-audit-'))
  directories.push(directory)
  const resolutionPath = join(directory, 'resolutions.jsonl')
  await writeFile(
    resolutionPath,
    JSON.stringify({
      placeId: 'pending',
      fingerprint: 'pending',
      tier: 'investigation',
      addressId: null,
      reason: 'multiple_close_matches',
      sourceTexts: ['publisher address'],
      candidates: [],
      investigation: {
        status: 'needs-further-investigation',
        priority: 'low',
        evidenceId: 'retained.json',
      },
    }) + '\n',
  )
  const store = new LocalPipelineBucket(directory)
  const result = await retainPlaceProvenance(store, {
    snapshotId: 'test-snapshot',
    resourceReleaseId: 'place-release',
    datasetCode: 'places',
    addresses: {
      snapshotId: 'test-snapshot',
      fixture: {
        ...parseSupplementaryCuration(structuredClone(policy)),
        entries: [],
        decisions: [],
      },
      resolutionPath,
      sourceVersion: '2026-09',
      supplementaryCount: 0,
    },
  })
  await verifyAuditResult(store, result.manifest)
  expect(result.manifest.guards[0]).toMatchObject({
    failed: 0,
    checked: 1,
    status: 'passed',
  })
  expect(result.manifest.applicationCount).toBe(0)
  expect(result.manifest.bulk[0]?.counts.decisions).toMatchObject({
    investigation: 1,
    review: 0,
  })
})
