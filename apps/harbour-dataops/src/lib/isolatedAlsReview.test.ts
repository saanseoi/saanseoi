import { expect, test } from 'bun:test'
import { mkdtemp, rm, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cachedReviewChild, fingerprintTree } from './isolatedAlsReview.ts'

test('successful child checkpoints replay findings; failed children cannot replace them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-child-'))
  try {
    const worker = join(dir, 'worker.ts')
    const checkpoint = join(dir, 'result.json')
    const input = { target: { remote: false }, sourceVersion: 'test' } as Parameters<
      typeof cachedReviewChild
    >[0]
    await Bun.write(
      worker,
      `await Bun.write(process.argv[3], JSON.stringify({identityRecords: [], driftCandidates: [{evidence: 'retained'}], curationApplications: [], divisionQuality: {issues: ['retained']}}))`,
    )
    const result = await cachedReviewChild(input, checkpoint, 'first', worker)
    await Bun.write(worker, 'process.exit(137)')
    expect(await cachedReviewChild(input, checkpoint, 'first', worker)).toEqual(result)
    await expect(
      cachedReviewChild(input, checkpoint, 'changed', worker),
    ).rejects.toThrow('137')
    expect((await Bun.file(checkpoint).json()).key).toBe('first')
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
