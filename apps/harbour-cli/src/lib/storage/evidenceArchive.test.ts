import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  MANIFEST_PATH,
  evidenceId,
  hydrateEvidence,
  parseEvidenceManifest,
  readManifest,
  refreshEvidenceManifest,
  syncEvidence,
  validateReviewCache,
  verifyEvidence,
  type EvidenceEntry,
  type EvidenceStore,
} from './evidenceArchive.ts'

function entry(
  text: string,
  path = 'fixtures/reviews/source/release.json',
): EvidenceEntry {
  const sha256 = createHash('sha256').update(text).digest('hex')
  return {
    path,
    sha256,
    size: Buffer.byteLength(text),
    objectKey: `evidence/sha256/${sha256}`,
    kind: 'source',
    sourceVersion: '2026-10-01',
  }
}
function store(objects = new Map<string, string>()) {
  let uploads = 0
  const api: EvidenceStore = {
    async retain(item, path) {
      const bytes = await verifyEvidence(item, path)
      const previous = objects.get(item.objectKey)
      if (previous && previous !== bytes.toString())
        throw new Error('immutable conflict')
      if (!previous) {
        objects.set(item.objectKey, bytes.toString())
        uploads++
      }
    },
    async download(item, path) {
      const value = objects.get(item.objectKey)
      if (value === undefined) throw new Error('missing archive evidence')
      await writeFile(path, value)
    },
    async dispose() {},
  }
  return { api, objects, uploads: () => uploads }
}
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'evidence-test-'))
  await mkdir(resolve(root, 'fixtures/reviews/source'), { recursive: true })
  await writeFile(
    resolve(root, MANIFEST_PATH),
    JSON.stringify({ schemaVersion: 1, bucket: 'ss-evidence', entries: [] }),
  )
  return root
}

test('catalogue retains exact bytes, keeps missing records and archives older index versions from snapshots', async () => {
  const root = await fixture()
  const archive = store()
  try {
    const path = resolve(root, 'fixtures/reviews/source/release.json')
    await writeFile(path, '{"sourceVersion":"2026-10-01", "report":1}\n')
    await refreshEvidenceManifest(root)
    const old = await readManifest(root)
    expect(old.entries).toHaveLength(1)
    expect(old.entries[0]!.sourceVersion).toBe('2026-10-01')
    await validateReviewCache(root, old)
    await writeFile(path, '{"sourceVersion":"2026-10-01", "report":2}\n')
    await expect(validateReviewCache(root, old)).rejects.toThrow('checksum mismatch')
    await refreshEvidenceManifest(root)
    const current = await readManifest(root)
    await syncEvidence(root, old, archive.api)
    await syncEvidence(root, current, archive.api)
    await syncEvidence(root, current, archive.api)
    expect(archive.uploads()).toBe(2)
    await rm(path)
    await refreshEvidenceManifest(root)
    expect((await readManifest(root)).entries).toEqual(current.entries)
    await hydrateEvidence(root, current.entries[0]!, archive.api)
    expect(await readFile(path, 'utf8')).toContain('"report":2')
    expect(evidenceId(current.entries[0]!)).toStartWith('evidence:sha256:')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unregistered evidence, unsafe paths, corrupt downloads and missing objects block retention', async () => {
  const root = await fixture()
  const text = '{"report":"approved evidence"}\n'
  const item = entry(text)
  const archive = store(new Map([[item.objectKey, 'corrupt']]))
  try {
    await writeFile(resolve(root, item.path), text)
    await expect(validateReviewCache(root, await readManifest(root))).rejects.toThrow(
      'Uncatalogued',
    )
    await rm(resolve(root, item.path))
    await expect(hydrateEvidence(root, item, archive.api)).rejects.toThrow(
      'checksum mismatch',
    )
    await expect(readFile(resolve(root, item.path))).rejects.toThrow()
    archive.objects.clear()
    await expect(
      syncEvidence(
        root,
        { schemaVersion: 1, bucket: 'ss-evidence', entries: [item] },
        archive.api,
      ),
    ).rejects.toThrow('missing archive')
    for (const path of [
      'fixtures/reviews/../outside.json',
      'fixtures/reviews//report.json',
      MANIFEST_PATH,
    ])
      expect(() =>
        parseEvidenceManifest({
          schemaVersion: 1,
          bucket: 'ss-evidence',
          entries: [{ ...item, path }],
        }),
      ).toThrow('Invalid')
    expect(() =>
      parseEvidenceManifest({
        schemaVersion: 1,
        bucket: 'ss-evidence',
        entries: [item, item],
      }),
    ).toThrow('Invalid')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Node R2 adapter retains and restores exact bytes through a local Wrangler binding', async () => {
  const { openEvidenceStore } = await import('./evidenceArchive.ts')
  const root = await fixture()
  const text = '{"synthetic":"evidence transport proof"}\n'
  const item = entry(text)
  const oldLogPath = process.env.WRANGLER_LOG_PATH
  process.env.WRANGLER_LOG_PATH = resolve(root, 'wrangler.log')
  let archive: EvidenceStore | undefined
  try {
    await writeFile(resolve(root, item.path), text)
    archive = await openEvidenceStore('ss-evidence-test', {
      persistPath: resolve(root, 'r2'),
    })
    await archive.retain(item, resolve(root, item.path))
    await archive.retain(item, resolve(root, item.path))
    await rm(resolve(root, item.path))
    await hydrateEvidence(root, item, archive)
    expect(await readFile(resolve(root, item.path), 'utf8')).toBe(text)
  } finally {
    await archive?.dispose()
    if (oldLogPath === undefined) delete process.env.WRANGLER_LOG_PATH
    else process.env.WRANGLER_LOG_PATH = oldLogPath
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
