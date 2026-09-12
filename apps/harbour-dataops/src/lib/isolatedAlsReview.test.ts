import { expect, test } from 'bun:test'
import { mkdtemp, rm, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { alsMembershipHash } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsMembership'
import {
  cachedReviewChild,
  divisionLookupFingerprint,
  fingerprintTree,
  block4ReviewDependencies,
} from './isolatedAlsReview.ts'

test('one-off Block 4 reuse pins all code and fixtures and retains live source and division dependencies', () => {
  const current = Array(6).fill('a'.repeat(64))
  const previous = Array(6).fill('b'.repeat(64))
  const dependencies = [...current, 'source digest', { snapshotId: 'live' }]
  expect(block4ReviewDependencies(dependencies, { current, previous })).toEqual([
    ...previous,
    ...dependencies.slice(6),
  ])
  expect(
    block4ReviewDependencies(['changed', ...dependencies.slice(1)], {
      current,
      previous,
    }),
  ).toBeNull()
  expect(block4ReviewDependencies(dependencies, null)).toBeNull()
  expect(
    block4ReviewDependencies(dependencies, { current, previous: ['bad'] }),
  ).toBeNull()
})

test('successful child checkpoints replay findings; failed children cannot replace them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-child-'))
  try {
    const worker = join(dir, 'worker.ts')
    const checkpoint = join(dir, 'result.json')
    const input = { target: { remote: false }, sourceVersion: 'test' } as Parameters<
      typeof cachedReviewChild
    >[0]
    const membership = {
      schemaVersion: 1,
      sourceVersion: 'test',
      addresses: [],
      sources: [],
      collections: [],
      aliases: [],
    }
    const successfulWorker = `const path = process.argv[3] + '.membership.json'; await Bun.write(path, ${JSON.stringify(JSON.stringify(membership))}); await Bun.write(process.argv[3], JSON.stringify({membership: {path, sha256: '${alsMembershipHash(membership)}', sourceVersion: 'test'}, identityRecords: [], driftCandidates: [{evidence: 'retained'}], curationApplications: [], divisionQuality: {issues: ['retained']}}))`
    await Bun.write(worker, successfulWorker)
    const result = await cachedReviewChild(input, checkpoint, 'first', worker)
    await Bun.write(worker, 'process.exit(137)')
    expect(await cachedReviewChild(input, checkpoint, 'first', worker)).toEqual(result)
    await expect(
      cachedReviewChild(input, checkpoint, 'changed', worker),
    ).rejects.toThrow('137')
    expect((await Bun.file(checkpoint).json()).key).toBe('first')
    // Membership is an independently validated dependency of the checkpoint.
    await Bun.write(
      result.membership.path,
      JSON.stringify({ ...membership, sourceVersion: 'tampered' }),
    )
    await expect(cachedReviewChild(input, checkpoint, 'first', worker)).rejects.toThrow(
      '137',
    )
    await Bun.write(worker, successfulWorker)
    await cachedReviewChild(input, checkpoint, 'first', worker)
    await Bun.write(
      worker,
      `await Bun.write(process.argv[3] + '.failure.json', JSON.stringify({message: 'Curation block-1 requires review. Review JSON: /tmp/review.json'})); process.exit(1)`,
    )
    await expect(
      cachedReviewChild(input, checkpoint, 'changed', worker),
    ).rejects.toThrow('Review JSON: /tmp/review.json')
    expect((await Bun.file(checkpoint).json()).key).toBe('first')
    await Bun.write(worker, 'process.exit(137)')
    await Bun.write(checkpoint, 'broken json')
    await expect(cachedReviewChild(input, checkpoint, 'first', worker)).rejects.toThrow(
      '137',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('preflight fingerprint is stable and detects same-length source edits, additions and removals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-fingerprint-'))
  try {
    await Bun.write(join(dir, 'source.json'), 'first')
    const baseline = await fingerprintTree(dir)
    expect(await fingerprintTree(dir)).toBe(baseline)
    await Bun.write(join(dir, 'source.json'), 'other')
    expect(await fingerprintTree(dir)).not.toBe(baseline)
    await Bun.write(join(dir, 'source.json'), 'first')
    expect(await fingerprintTree(dir)).toBe(baseline)
    await Bun.write(join(dir, 'new.json'), 'new')
    expect(await fingerprintTree(dir)).not.toBe(baseline)
    await rm(join(dir, 'new.json'))
    expect(await fingerprintTree(dir)).toBe(baseline)
    await rename(join(dir, 'source.json'), join(dir, 'renamed.json'))
    expect(await fingerprintTree(dir)).not.toBe(baseline)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('division lookup fingerprints ignore map insertion order but retain lookup changes', () => {
  const lookup = {
    ambiguousAreaEn: new Set(['a']),
    ambiguousAreaZh: new Set(['甲']),
    ambiguousDistrictEn: new Set(['d']),
    ambiguousDistrictZh: new Set(['丁']),
    countryId: 'hk',
    areaByEn: new Map([
      ['beta', 'b'],
      ['alpha', 'a'],
    ]),
    areaByZh: new Map([
      ['乙', 'b'],
      ['甲', 'a'],
    ]),
    districtByEn: new Map([
      ['delta', 'd'],
      ['charlie', 'c'],
    ]),
    districtByZh: new Map([
      ['丁', 'd'],
      ['丙', 'c'],
    ]),
    snapshotId: 'snapshot-1',
  }
  const reordered = {
    ...lookup,
    areaByEn: new Map([...lookup.areaByEn].reverse()),
    areaByZh: new Map([...lookup.areaByZh].reverse()),
  }

  expect(divisionLookupFingerprint(reordered)).toEqual(
    divisionLookupFingerprint(lookup),
  )
  lookup.areaByEn.set('gamma', 'g')
  expect(divisionLookupFingerprint(lookup)).not.toEqual(
    divisionLookupFingerprint(reordered),
  )
})
