import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { buildDivisionHierarchyLookup } from '@repo/core/pipeline/services/division'

test('actual Parquet hierarchy lookup accepts division schemas without admin_level', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'division-hierarchy-schema-'))
  const filename = join(directory, 'division.parquet')
  try {
    parquetWriteFile({
      filename,
      columnData: [
        { name: 'id', type: 'STRING', data: ['district', 'village'] },
        { name: 'subtype', type: 'STRING', data: ['region', 'locality'] },
        { name: 'class', type: 'STRING', data: [null, 'village'], nullable: true },
        {
          name: 'parent_division_id',
          type: 'STRING',
          data: [null, 'district'],
          nullable: true,
        },
        {
          name: 'names',
          type: 'JSON',
          data: [{ common: { en: 'District' } }, { common: { en: 'Village' } }],
        },
      ],
    })
    const lookup = await buildDivisionHierarchyLookup(
      await asyncBufferFromFile(filename),
      { source: 'overture', sourceVersion: '2025-09-24.0' },
    )
    await expect(
      buildDivisionHierarchyLookup(await asyncBufferFromFile(filename), {
        source: 'overture',
        sourceVersion: '2026-02-18.0',
      }),
    ).rejects.toThrow('parquet column not found: admin_level')
    await expect(
      buildDivisionHierarchyLookup(await asyncBufferFromFile(filename), {
        source: 'overture',
        sourceVersion: '2020-01-01.0',
      }),
    ).rejects.toThrow('No accepted Overture division schema')
    expect(lookup.size).toBe(2)
    expect(lookup.get('district')).toMatchObject({
      level: 2,
      type: 'district',
      i18n: { en: { name: 'District' } },
    })
    expect(lookup.get('village')).toMatchObject({
      level: 5,
      type: 'village',
      i18n: { en: { name: 'Village' } },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('actual Parquet hierarchy lookup applies the guarded Loop fixture and rejects drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'division-hierarchy-audit-'))
  const filename = join(directory, 'division.parquet')
  const id = '222b7818-970a-491d-98b6-b88d8c6f0161'
  function write(adminLevel?: number) {
    parquetWriteFile({
      filename,
      columnData: [
        { name: 'id', type: 'STRING', data: [id] },
        ...(adminLevel === undefined
          ? []
          : [{ name: 'admin_level', type: 'INT32' as const, data: [adminLevel] }]),
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
    write()
    const earlierLookup = await buildDivisionHierarchyLookup(
      await asyncBufferFromFile(filename),
      { source: 'overture', sourceVersion: '2025-09-24.0' },
    )
    expect(earlierLookup.get(id)).toMatchObject({ level: 4, type: 'macrohood' })
    write(2)
    const lookup = await buildDivisionHierarchyLookup(
      await asyncBufferFromFile(filename),
      { source: 'overture', sourceVersion: '2026-02-18.0' },
    )
    expect(lookup.get(id)).toMatchObject({
      level: 4,
      type: 'macrohood',
      i18n: { en: { name: 'Lok Ma Chau Loop' } },
    })
    write(3)
    await expect(
      buildDivisionHierarchyLookup(await asyncBufferFromFile(filename), {
        source: 'overture',
        sourceVersion: '2026-02-18.0',
      }),
    ).rejects.toThrow('guard mismatch')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
