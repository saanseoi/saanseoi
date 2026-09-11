import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { LocalPipelineBucket } from '../../../pipeline/local/localBucket.ts'
import { readPreparedDivisions } from '../../../pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation.ts'
import { prepareHkgovPlandNewTownParquet } from './hkgovPlandNewTown.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../..')
const COHORTS = ['2006', '2011', '2016', '2021']

describe('Planning Department New Town source identifiers', () => {
  test.each(COHORTS)(
    '%s keeps source keys, area references and names consistent',
    async year => {
      const directory = await mkdtemp(join(tmpdir(), 'pland-new-town-identifiers-'))
      try {
        const inputFile = resolve(
          REPO_ROOT,
          `data/hkgov/pland/${year}/hkgov-pland-new-town-${year}.geojson`,
        )
        const input = JSON.parse(await readFile(inputFile, 'utf8')) as {
          features: Array<{
            properties: { NewTown_en: string; NewTown_Tc: string; NewTown_Sc: string }
          }>
        }
        const bucket = new LocalPipelineBucket(directory)
        const divisionFile = bucket.resolvePath('division.parquet')
        await prepareHkgovPlandNewTownParquet({
          inputFile,
          outputFile: divisionFile,
          sourceVersion: year,
          resourceType: 'division',
        })
        const divisions = await readPreparedDivisions(
          bucket,
          'division.parquet',
          `dr-hk-hkgov-pland-division-new-town-${year}`,
          false,
          new Map(),
        )
        const areaFile = join(directory, 'area.parquet')
        await prepareHkgovPlandNewTownParquet({
          inputFile,
          outputFile: areaFile,
          sourceVersion: year,
          resourceType: 'divisionArea',
        })
        const areas = await parquetReadObjects({
          file: await asyncBufferFromFile(areaFile),
          compressors,
        })

        expect(divisions).toHaveLength(input.features.length)
        expect(areas).toHaveLength(input.features.length)
        expect(new Set(divisions.map(row => row.newTown?.sourceRecordId)).size).toBe(
          input.features.length,
        )
        for (const [index, division] of divisions.entries()) {
          const sourceRecordId = division.newTown?.sourceRecordId
          const properties = input.features[index]?.properties
          if (!properties) throw new Error('Missing publisher feature.')
          expect(sourceRecordId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          expect(division.newTown?.properties).toEqual(properties)
          expect(division.base.identifiers).toEqual({ 'PLAND:NEWTOWN': sourceRecordId })
          expect(
            Object.fromEntries(division.i18n.map(row => [row.locale, row.name])),
          ).toEqual({
            en: properties.NewTown_en.trim(),
            'zh-hant': properties.NewTown_Tc.trim(),
            'zh-hans': properties.NewTown_Sc.trim(),
          })
          expect(areas[index]).toMatchObject({
            division_id: division.base.id,
            newtown_id: sourceRecordId,
            identifiers: { 'PLAND:NEWTOWN': sourceRecordId },
            sources: [{ dataset: 'hkgov-pland-new-town', newTownId: sourceRecordId }],
            source_properties: { newtown_id: sourceRecordId },
          })
        }
        if (year === '2021') {
          const codes = JSON.parse(
            await readFile(
              resolve(
                REPO_ROOT,
                'fixtures/meta/divisionCodes/hkgov-pland-new-town.json',
              ),
              'utf8',
            ),
          ) as { assignments: Array<{ canonicalId: string; divisionCode: string }> }
          expect(
            divisions
              .map(row => ({
                canonicalId: row.base.id,
                divisionCode: (row.newTown?.sourceRecordId ?? '')
                  .replaceAll('-', '_')
                  .toUpperCase(),
              }))
              .sort((a, b) => a.divisionCode.localeCompare(b.divisionCode)),
          ).toEqual(
            codes.assignments.toSorted((a, b) =>
              a.divisionCode.localeCompare(b.divisionCode),
            ),
          )
        }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test.each([
    ['Sha Tin', 'Sha/Tin', 'duplicate normalised provider identifiers'],
    ['Sha Tin', ' / - ', 'cannot form a source record identifier'],
  ])('rejects unsafe source keys from %s and %s', async (first, second, error) => {
    const directory = await mkdtemp(join(tmpdir(), 'pland-new-town-invalid-id-'))
    try {
      const inputFile = join(directory, 'input.geojson')
      const names = [
        first,
        second,
        ...Array.from({ length: 10 }, (_, i) => `Town ${i}`),
      ]
      await writeFile(
        inputFile,
        JSON.stringify({
          type: 'FeatureCollection',
          features: names.map(name => ({
            type: 'Feature',
            properties: { NewTown_en: name, NewTown_Tc: '沙田', NewTown_Sc: '沙田' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [114, 22],
                  [115, 22],
                  [115, 23],
                  [114, 22],
                ],
              ],
            },
          })),
        }),
      )
      await expect(
        prepareHkgovPlandNewTownParquet({
          inputFile,
          outputFile: join(directory, 'division.parquet'),
          sourceVersion: '2006',
          resourceType: 'division',
        }),
      ).rejects.toThrow(error)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
