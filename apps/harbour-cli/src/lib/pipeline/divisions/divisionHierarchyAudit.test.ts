import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { buildDivisionHierarchyLookup } from '@repo/core/pipeline/services/divisions/division'
import { resolveDivisionNameTranslations } from './processLocalDivisionSqlUploadTranslations'
import { readDivisionRowsWithFixtures } from '@repo/core/pipeline/services/divisions/divisionFixtures'
import { overtureHongKongAreas } from '@repo/core/pipeline/services/divisions/overtureHongKongAreas'

test('Parquet batches preserve an existing Kowloon identity without a patch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'division-replacement-order-'))
  const filename = join(directory, 'division.parquet')
  const kowloonId = '17009785-57fd-4e5b-af86-2d27352e4718'
  const names = [
    'Kowloon',
    ...overtureHongKongAreas.flatMap(area => [...area.districtNames]),
  ]
  try {
    parquetWriteFile({
      filename,
      columnData: [
        {
          name: 'id',
          type: 'STRING',
          data: names.map((name, index) => (index ? name : kowloonId)),
        },
        { name: 'names', type: 'JSON', data: names.map(name => ({ primary: name })) },
        {
          name: 'subtype',
          type: 'STRING',
          data: names.map((_, index) => (index ? 'region' : 'locality')),
        },
        {
          name: 'class',
          type: 'STRING',
          data: names.map((_, index) => (index ? null : 'city')),
          nullable: true,
        },
      ],
    })
    let sourceSeen = false
    let supplementalSeen = false
    for await (const batch of readDivisionRowsWithFixtures(
      await asyncBufferFromFile(filename),
      {
        source: 'overture',
        resourceType: 'division',
        regionCode: 'hk',
      },
      2,
    )) {
      if (!batch.rows.some(row => row.id === kowloonId)) continue
      if (batch.isSupplemental) {
        expect(batch.replacedDivisionIds.size).toBe(0)
        expect(batch.processingActions).toEqual([])
        supplementalSeen = true
      } else {
        expect(batch.replacedDivisionIds.has(kowloonId)).toBe(false)
        expect(batch.replacedDivisionIds.has('North District')).toBe(false)
        sourceSeen = true
      }
    }
    expect(sourceSeen).toBe(true)
    expect(supplementalSeen).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

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
      class: 'district',
      i18n: { en: { name: 'District' } },
    })
    expect(lookup.get('village')).toMatchObject({
      level: 5,
      class: 'village',
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
    expect(earlierLookup.get(id)).toMatchObject({ level: 4, class: 'macrohood' })
    // Reach fixture resolution without writing translations: the missing dataset
    // code is checked only after every source row has been normalised.
    const message = {
      datasetId: 'classification-test',
      rawObjectKey: 'division.parquet',
      // Disable Hong Kong area synthesis for this single-record fixture.
      regionCode: 'mo' as const,
      cohortKey: '2026-01-21.0',
      source: 'overture',
      sourceVersion: '2026-01-21.0',
      theme: 'divisions' as const,
      resourceType: 'division' as const,
    }
    await expect(
      resolveDivisionNameTranslations(
        await asyncBufferFromFile(filename),
        message,
        earlierLookup,
        'classification-test',
        false,
      ),
    ).rejects.toThrow('Division i18n fixtures require a dataset code.')
    await expect(
      resolveDivisionNameTranslations(
        await asyncBufferFromFile(filename),
        { ...message, sourceVersion: '2026-02-18.0' },
        earlierLookup,
        'classification-test',
        false,
      ),
    ).rejects.toThrow('guard mismatch')
    write(2)
    const lookup = await buildDivisionHierarchyLookup(
      await asyncBufferFromFile(filename),
      { source: 'overture', sourceVersion: '2026-02-18.0' },
    )
    expect(lookup.get(id)).toMatchObject({
      level: 4,
      class: 'macrohood',
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
