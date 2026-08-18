import { expect, test } from 'bun:test'

import { zipSync } from 'fflate'

import { unzipSelected } from './zip.ts'

test('bounds archive entry counts before extracting selected files', () => {
  const archive = zipSync(
    Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [`${index}.txt`, new Uint8Array()]),
    ),
  )

  expect(() => unzipSelected(archive, () => true)).toThrow(
    'Source archive exceeds 1000 entries.',
  )
})
