import { describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'

import { assertSafeZipArchive, readSafeZipArchive } from './zipArchive.ts'

describe('ZIP archive safety', () => {
  test('lists entries without expanding unselected members', () => {
    const archive = zipSync({
      'source.dbf': new Uint8Array([1, 2, 3]),
      'source.prj': new TextEncoder().encode('EPSG:2326'),
    })

    const inspected = readSafeZipArchive(archive, {
      select: name => name.endsWith('.prj'),
    })

    expect(inspected.files).toEqual(['source.dbf', 'source.prj'])
    expect(Object.keys(inspected.entries)).toEqual(['source.prj'])
  })

  test('rejects unsafe paths and excessive expansion before extraction', () => {
    expect(() =>
      assertSafeZipArchive(zipSync({ '../source.dbf': new Uint8Array([1]) })),
    ).toThrow('Unsafe ZIP archive entry')

    expect(() =>
      assertSafeZipArchive(zipSync({ 'source.dbf': new Uint8Array(16) }), {
        maxExpandedBytes: 8,
      }),
    ).toThrow('ZIP archive expands beyond the 8 bytes safety limit')
  })

  test('bounds entry count, member size and compression ratio', () => {
    const twoEntries = zipSync({
      'one.txt': new Uint8Array([1]),
      'two.txt': new Uint8Array([2]),
    })
    expect(() => assertSafeZipArchive(twoEntries, { maxEntries: 1 })).toThrow(
      'ZIP archive contains more than 1 entries',
    )

    const compressible = zipSync({ 'large.txt': new Uint8Array(1_024) })
    expect(() => assertSafeZipArchive(compressible, { maxEntryBytes: 512 })).toThrow(
      'per-entry limit',
    )
    expect(() =>
      assertSafeZipArchive(compressible, { maxCompressionRatio: 2 }),
    ).toThrow('compression-ratio limit')
  })
})
