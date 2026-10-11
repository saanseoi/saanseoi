import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPinnedReviewArchive, type ReviewSourcePin } from './reviewSourceArchives'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true })),
  )
})
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'division-review-'))
  roots.push(root)
  const bytes = new TextEncoder().encode('immutable publisher content')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const pin: ReviewSourcePin = {
    datasetCode: 'ds-hk-example-division',
    releaseCode: 'dr-hk-example-division-2026-01-01.0',
    sourceVersion: '2026-01-01.0',
    resourceType: 'division',
    rawObjectKey: `by-source/${hash}.zip`,
    contentHash: hash,
    releaseNotesUrl: null,
    assetId: 'test-asset',
  }
  const file = join(root, 'source.zip')
  await writeFile(file, bytes)
  return { root, bytes, pin, file }
}
test('API failure falls back to exactly the pinned local archive and retains a reset-independent cache', async () => {
  const { root, bytes, pin, file } = await setup()
  const urls: string[] = []
  const path = await loadPinnedReviewArchive(pin, {
    root,
    apiBaseUrl: 'https://api.example',
    paths: { [pin.releaseCode]: file },
    fetch: async url => {
      urls.push(String(url))
      return new Response('', { status: 503 })
    },
  })
  expect(urls).toEqual(['https://api.example/v0.1/assets/test-asset'])
  expect(new Uint8Array(await readFile(path))).toEqual(bytes)
  await rm(file)
  expect(await loadPinnedReviewArchive(pin, { root })).toBe(path)
})
test('successful API bytes are hash-checked before use; mismatches cannot silently fall back', async () => {
  const { root, pin, file } = await setup()
  await expect(
    loadPinnedReviewArchive(pin, {
      root,
      apiBaseUrl: 'https://api.example',
      paths: { [pin.releaseCode]: file },
      fetch: async () => new Response('wrong edition'),
    }),
  ).rejects.toThrow('hash mismatch')
})
test('an empty local workspace can recover the exact archive from its retained R2 key', async () => {
  const { root, pin, bytes } = await setup()
  let requested = ''
  const path = await loadPinnedReviewArchive(pin, {
    root,
    archiveBaseUrl: 'https://archives.example',
    fetch: async url => {
      requested = String(url)
      return new Response(bytes)
    },
  })
  expect(requested).toBe(`https://archives.example/${pin.rawObjectKey}`)
  expect(new Uint8Array(await readFile(path))).toEqual(bytes)
})
test('a different latest local release never satisfies a missing pinned archive', async () => {
  const { root, pin } = await setup()
  await mkdir(join(root, '.local/division-review/archives'), { recursive: true })
  await writeFile(join(root, '.local/division-review/archives/latest'), 'new bytes')
  await expect(loadPinnedReviewArchive(pin, { root })).rejects.toThrow(
    'Missing pinned review archive',
  )
})
