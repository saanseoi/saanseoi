import { expect, test } from 'bun:test'
import { appendFile, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { placeComputationContract, placeComputationSources } from './placeRecordCache'

test('shared address parser edits invalidate retained Place computations', async () => {
  const root = resolve(import.meta.dir, '../../../../../..')
  const copy = await mkdtemp(join(tmpdir(), 'place-contract-'))
  try {
    for (const source of placeComputationSources(root)) {
      const destination = join(copy, relative(root, source))
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
    const before = placeComputationContract(copy)
    expect(placeComputationContract(copy)).toBe(before)
    await appendFile(join(copy, 'libs/address/src/parse.ts'), '\n// parser revision\n')
    expect(placeComputationContract(copy)).not.toBe(before)
  } finally {
    await rm(copy, { recursive: true, force: true })
  }
})
