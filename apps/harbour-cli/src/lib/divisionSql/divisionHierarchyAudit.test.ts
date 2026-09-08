import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { buildDivisionHierarchyLookup } from '@repo/core/pipeline/services/division'

test('actual Parquet hierarchy lookup applies the guarded Loop fixture and rejects drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'division-hierarchy-audit-'))
  const filename = join(directory, 'division.parquet')
  const id = '222b7818-970a-491d-98b6-b88d8c6f0161'
  function write(adminLevel: number) {
    parquetWriteFile({
      filename,
      columnData: [
        { name: 'id', type: 'STRING', data: [id] },
        { name: 'admin_level', type: 'INT32', data: [adminLevel] },
        { name: 'subtype', type: 'STRING', data: ['region'] },
        { name: 'class', type: 'STRING', data: [null], nullable: true },
        { name: 'parent_division_id', type: 'STRING', data: [null], nullable: true },
        {
          name: 'names',
          type: 'JSON',
          data: [{ common: { en: 'Lok Ma Chau Loop', 'zh-Hant': '落馬洲河套地區' } }],
        },
      ],
    })
  }
  try {
    write(2)
    const lookup = await buildDivisionHierarchyLookup(
      await asyncBufferFromFile(filename),
    )
    expect(lookup.get(id)).toMatchObject({
      level: 4,
      type: 'macrohood',
      i18n: { en: { name: 'Lok Ma Chau Loop' } },
    })
    write(3)
    await expect(
      buildDivisionHierarchyLookup(await asyncBufferFromFile(filename)),
    ).rejects.toThrow('guard mismatch')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
