import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { downloadAndPrepareSourceAsset } from './sourceAssets'
import { packageSourceReleaseFile } from './sourceReleasePackaging'

test('source downloads consume the stream without whole-response buffering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-streaming-'))
  const originalFetch = globalThis.fetch
  const bytes = new Uint8Array(1024 * 1024).fill(71)
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
          controller.enqueue(bytes.subarray(offset, offset + 64 * 1024))
        controller.close()
      },
    }),
  )
  Object.defineProperty(response, 'arrayBuffer', {
    value: async () => {
      throw new Error('Whole-response buffering is forbidden')
    },
  })
  globalThis.fetch = (async () => response) as unknown as typeof fetch
  try {
    const asset = await downloadAndPrepareSourceAsset({
      downloadedAt: '2026-09-12T00:00:00Z',
      fileName: 'source.pdf',
      outputDir: root,
      role: 'sourcePdf',
      url: 'https://example.test/source.pdf',
    })
    expect(asset.manifest.artefact.sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    )
    expect(asset.manifest.artefact.byteLength).toBe(bytes.length)
    expect(new Uint8Array(await readFile(asset.filePath))).toEqual(bytes)
  } finally {
    globalThis.fetch = originalFetch
    await rm(root, { recursive: true, force: true })
  }
})

test('ZIP cache verifies content despite unchanged file times and repairs a damaged derived archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-packaging-'))
  const path = join(root, 'source.gml')
  const initial = '<source>one</source>'
  const revised = '<source>two</source>'
  try {
    await writeFile(path, initial)
    const before = await stat(path)
    const first = await packageSourceReleaseFile(
      path,
      'source.gml',
      join(root, 'cache'),
    )
    await writeFile(path, revised)
    await utimes(path, before.atime, before.mtime)
    const second = await packageSourceReleaseFile(
      path,
      'source.gml',
      join(root, 'cache'),
    )
    expect(second.filePath).not.toBe(first.filePath)
    expect(second.original.sha256).not.toBe(first.original.sha256)
    await writeFile(second.filePath, 'damaged derived archive')
    const repaired = await packageSourceReleaseFile(
      path,
      'source.gml',
      join(root, 'cache'),
    )
    expect(repaired.sha256).toBe(second.sha256)
    expect(
      new TextDecoder().decode(
        unzipSync(await readFile(repaired.filePath))['source.gml'],
      ),
    ).toBe(revised)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
