import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetReadObjects } from 'hyparquet'
import { writeResourceSourceParquet } from './resourceSourceArchive'

test('native source export preserves table identity, complex values and nullable fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resource-source-'))
  try {
    const path = await writeResourceSourceParquet(directory, [
      {
        name: 'nativeFeatures',
        rows: [
          {
            sourceRecordId: 'one',
            properties: { name: 'Island' },
            geometry: { type: 'Point', coordinates: [114, 22] },
            count: 3,
            active: true,
          },
        ],
      },
      { name: 'nativeNames', rows: [{ sourceRecordId: 'two', name: 'Island' }] },
    ])
    const bytes = await readFile(path)
    const rows = await parquetReadObjects({
      file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      sourceTable: 'nativeFeatures',
      sourceRecordId: 'one',
      count: 3,
      active: true,
      name: null,
    })
    expect(JSON.parse(String(rows[0]?.properties))).toEqual({ name: 'Island' })
    expect(JSON.parse(String(rows[0]?.geometry))).toEqual({
      type: 'Point',
      coordinates: [114, 22],
    })
    expect(rows[1]).toMatchObject({
      sourceTable: 'nativeNames',
      sourceRecordId: 'two',
      name: 'Island',
      properties: null,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
