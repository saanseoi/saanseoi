import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pushedManifests } from './evidence-archive.ts'

test('push checks exact non-HEAD refs, intermediate catalogues, multiple refs and deletion-only pushes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'evidence-push-'))
  const previous = process.cwd()
  const zero = '0'.repeat(40)
  async function git(...args: string[]) {
    const result = Bun.spawn(['git', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(result.stdout).text()
    if (await result.exited) throw new Error(await new Response(result.stderr).text())
    return output.trim()
  }
  try {
    await git('init', '-q')
    await git('config', 'commit.gpgsign', 'false')
    await git('config', 'user.name', 'Evidence test')
    await git('config', 'user.email', 'evidence@example.invalid')
    await mkdir(resolve(root, 'fixtures/reviews'), { recursive: true })
    await writeFile(
      resolve(root, 'fixtures/reviews/manifest.json'),
      JSON.stringify({ schemaVersion: 1, bucket: 'ss-evidence', entries: [] }),
    )
    await git('add', '.')
    await git('commit', '-qm', 'first catalogue')
    const first = await git('rev-parse', 'HEAD')
    await writeFile(
      resolve(root, 'fixtures/reviews/manifest.json'),
      JSON.stringify({ schemaVersion: 1, bucket: 'ss-evidence-other', entries: [] }),
    )
    await git('commit', '-qam', 'second catalogue')
    const second = await git('rev-parse', 'HEAD')
    await git('rm', 'fixtures/reviews/manifest.json')
    await git('commit', '-qm', 'removed catalogue')
    const third = await git('rev-parse', 'HEAD')
    process.chdir(root)
    expect(
      (
        await pushedManifests(
          `refs/heads/other ${second} refs/heads/other ${zero}\nrefs/heads/main ${third} refs/heads/main ${first}`,
        )
      )
        .map(m => m.bucket)
        .sort(),
    ).toEqual(['ss-evidence', 'ss-evidence-other'])
    expect(
      await pushedManifests(`refs/heads/main ${zero} refs/heads/main ${third}`),
    ).toEqual([])
    expect(
      await pushedManifests(`refs/heads/main ${third} refs/heads/main ${second}`),
    ).toEqual([])
    await expect(pushedManifests('invalid')).rejects.toThrow('Invalid Git')
  } finally {
    process.chdir(previous)
    await rm(root, { recursive: true, force: true })
  }
})

test('push receipts reuse successful objects, expire, isolate targets and never cache failures', async () => {
  const { createHash } = await import('node:crypto')
  const { readdir } = await import('node:fs/promises')
  const { syncPushEvidence, PUSH_EVIDENCE_CACHE_TTL_MS } = await import(
    './evidence-push-cache.ts'
  )
  const root = await mkdtemp(resolve(tmpdir(), 'evidence-receipts-'))
  const bytes = 'archived evidence'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const manifest = {
    schemaVersion: 1 as const,
    bucket: 'ss-evidence',
    entries: [
      {
        path: 'fixtures/reviews/source/old.json',
        kind: 'source',
        sha256,
        size: bytes.length,
        objectKey: `evidence/sha256/${sha256}`,
      },
    ],
  }
  let time = 1_000_000
  let opens = 0
  let downloads = 0
  let disposed = 0
  let fail = false
  const options = {
    accountId: 'account-a',
    now: () => time,
    async openStore() {
      opens++
      return {
        async retain() {
          throw new Error('unexpected retain')
        },
        async download(_entry: unknown, path: string) {
          downloads++
          if (fail) throw new Error('remote failure')
          await writeFile(path, bytes)
        },
        async dispose() {
          disposed++
        },
      }
    },
  }
  try {
    await syncPushEvidence(root, manifest, options)
    await syncPushEvidence(root, manifest, options)
    expect(opens).toBe(1)
    expect(downloads).toBe(1)
    time += PUSH_EVIDENCE_CACHE_TTL_MS
    fail = true
    await expect(syncPushEvidence(root, manifest, options)).rejects.toThrow(
      'remote failure',
    )
    fail = false
    await syncPushEvidence(root, manifest, options)
    expect(downloads).toBe(3)
    await syncPushEvidence(root, manifest, { ...options, accountId: 'account-b' })
    await syncPushEvidence(root, { ...manifest, bucket: 'other-evidence' }, options)
    expect(downloads).toBe(5)
    await syncPushEvidence(root, manifest, { ...options, accountId: undefined })
    await syncPushEvidence(root, manifest, { ...options, accountId: undefined })
    expect(downloads).toBe(7)
    // A mismatched size must not reuse the valid object's receipt.
    await expect(
      syncPushEvidence(
        root,
        { ...manifest, entries: [{ ...manifest.entries[0]!, size: 1 }] },
        options,
      ),
    ).rejects.toThrow('checksum mismatch')
    expect(downloads).toBe(8)
    const cache = resolve(root, '.local/evidence-archive/push-verification-v1')
    for (const file of await readdir(cache))
      await writeFile(resolve(cache, file), 'broken')
    await syncPushEvidence(root, manifest, options)
    expect(downloads).toBe(9)
    time-- // Future-dated receipts do not suppress verification.
    await syncPushEvidence(root, manifest, options)
    expect(downloads).toBe(10)
    expect(disposed).toBe(opens)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
