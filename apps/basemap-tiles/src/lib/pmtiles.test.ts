import { expect, test } from 'bun:test'
import { EtagMismatch } from 'pmtiles'
import { openPmtiles } from './pmtiles'

const object = (etag: string, body = true) => ({
  body: body ? {} : null,
  etag,
  arrayBuffer: async () => new ArrayBuffer(0),
})

test('pins every R2 range read to the advertised archive ETag', async () => {
  const requests: unknown[] = []
  const pmtiles = openPmtiles(
    {
      BUCKET: {
        get: async (_key: string, options: unknown) => {
          requests.push(options)
          return object('archive-etag')
        },
      },
    } as never,
    'basemap/hk/hongkong-latest.pmtiles',
    'archive-etag',
  )

  await pmtiles.source.getBytes(0, 16)
  await pmtiles.source.getBytes(16, 16, undefined, 'header-etag')

  expect(requests).toEqual([
    {
      range: { offset: 0, length: 16 },
      onlyIf: { etagMatches: 'archive-etag' },
    },
    {
      range: { offset: 16, length: 16 },
      onlyIf: { etagMatches: 'archive-etag' },
    },
  ])
})

test('reports an ETag mismatch when a pinned archive has been replaced', async () => {
  const pmtiles = openPmtiles(
    {
      BUCKET: {
        get: async () => object('new-etag', false),
      },
    } as never,
    'basemap/hk/hongkong-latest.pmtiles',
    'old-etag',
  )

  await expect(pmtiles.source.getBytes(0, 16)).rejects.toBeInstanceOf(EtagMismatch)
})
