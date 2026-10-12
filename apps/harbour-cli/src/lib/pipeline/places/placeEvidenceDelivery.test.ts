import { expect, test } from 'bun:test'
import { importPlaceSqlChunks } from './processLocalPlaceSqlUploadImport'

test('SQL delivery cannot start without successful evidence retention', async () => {
  const sql = { evidenceDocuments: [{ kind: 'record-evidence' }] } as Parameters<
    typeof importPlaceSqlChunks
  >[1]
  const targets = {} as Parameters<typeof importPlaceSqlChunks>[0]
  const options = {} as Parameters<typeof importPlaceSqlChunks>[2]
  await expect(importPlaceSqlChunks(targets, sql, options)).rejects.toThrow(
    'retained in R2',
  )
  await expect(
    importPlaceSqlChunks(targets, sql, options, undefined, async () => {
      throw new Error('R2 unavailable')
    }),
  ).rejects.toThrow('R2 unavailable')
})
