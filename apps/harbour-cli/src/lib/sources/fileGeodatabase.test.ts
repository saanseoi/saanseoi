import { describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'

import { assertSafeFileGeodatabaseArchive } from './fileGeodatabase.ts'

describe('FileGDB archive safety', () => {
  test('accepts ordinary geodatabase entry names', () => {
    const archive = zipSync({
      'publisher.gdb/a00000001.gdbtable': new Uint8Array([1]),
      'publisher.gdb/a00000001.gdbtablx': new Uint8Array([2]),
    })

    expect(() => assertSafeFileGeodatabaseArchive(archive)).not.toThrow()
  })

  test('rejects traversal and prototype archive entry names', () => {
    for (const name of [
      '../a00000001.gdbtable',
      'publisher.gdb/__proto__/a00000001.gdbtable',
    ]) {
      expect(() =>
        assertSafeFileGeodatabaseArchive(zipSync({ [name]: new Uint8Array([1]) })),
      ).toThrow(`Unsafe ZIP archive entry: ${name}`)
    }
  })
})
