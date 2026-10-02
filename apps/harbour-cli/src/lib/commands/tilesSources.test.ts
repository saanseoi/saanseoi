import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadFile } from './tilesSources.ts'

test('source download retries a redirect loop before replacing retained bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'basemap-source-retry-'))
  const path = join(directory, 'source.osm.pbf')
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests += 1
      return requests <= 11
        ? new Response(null, { status: 307, headers: { Location: request.url } })
        : new Response('fresh source')
    },
  })
  try {
    await writeFile(path, 'retained source')
    await downloadFile(server.url.toString(), path)
    expect(requests).toBe(12)
    expect(await readFile(path, 'utf8')).toBe('fresh source')
    expect(existsSync(`${path}.download`)).toBe(false)
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)
