import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { unzipSync } from 'fflate'

import {
  overtureHongKongAreaDivisionId,
  overtureHongKongAreas,
} from '@repo/core/pipeline/services/overtureHongKongAreas'

import {
  hkgovCenstatdStatisticDivisionId,
  prepareHkgovCenstatdStatisticGeographyUploads,
  prepareHkgovCenstatdStatisticUpload,
  readHkgovCenstatdStatisticArchive,
  type CenstatdStatisticDatasetCode,
} from './hkgovCenstatdStatistics.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
const workDirs: string[] = []

const CASES: Array<{
  archive: string
  datasetCode: CenstatdStatisticDatasetCode
  rowCount: number
  sourceVersion: string
}> = [
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1728978338390_76872/2026-Q2/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
    rowCount: 3495,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1695182015782_79001/2026-Q2/source.zip',
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
    rowCount: 540,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1695181913136_27614/2026-Q2/source.zip',
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
    rowCount: 13,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635933883228_46491/2023-Q4/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
    rowCount: 3,
    sourceVersion: '2023-H2',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635934103275_66203/2023-Q4/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district',
    rowCount: 18,
    sourceVersion: '2023-H2',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635934545173_69201/2026-Q2/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
    rowCount: 180,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635934545173_69201/2023-Q4/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
    rowCount: 126,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635934545173_69201/2024-Q2/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
    rowCount: 144,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635934545173_69201/2025-Q2/source.zip',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
    rowCount: 162,
    sourceVersion: '2021',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635932488538_10765/2026-Q2/source.zip',
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
    rowCount: 18,
    sourceVersion: '2016',
  },
  {
    archive:
      'data/hkgov/csdi/archive/censtatd_rcd_1635933617052_68946/2026-Q2/source.zip',
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
    rowCount: 18,
    sourceVersion: '2021',
  },
]

afterEach(async () => {
  await Promise.all(
    workDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  )
})

describe('C&SD native statistics archives', () => {
  test('normalises a mirrored archive directly without a Parquet hand-off', async () => {
    const entry = CASES[2]!
    const archive = unzipSync(await readFile(resolve(REPO_ROOT, entry.archive)))
    const rows = readHkgovCenstatdStatisticArchive({
      datasetCode: entry.datasetCode,
      inputGml: Object.fromEntries(
        Object.entries(archive)
          .filter(([name]) => name.endsWith('.gml'))
          .map(([name, content]) => [name, new TextDecoder().decode(content)]),
      ),
      sourceVersion: entry.sourceVersion,
    })

    expect(rows).toHaveLength(entry.rowCount)
    expect(rows[0]).toMatchObject({ layerName: 'NewTown_21C' })
  })

  for (const entry of CASES) {
    test(`${entry.datasetCode} validates its publisher archive`, async () => {
      const dir = await unpack(entry.archive)
      const outputFile = join(dir, 'statistics.parquet')
      const sourceArchiveSha256 = 'a'.repeat(64)
      const result = await prepareHkgovCenstatdStatisticUpload({
        datasetCode: entry.datasetCode,
        inputFiles: await gmlFiles(dir),
        outputFile,
        sourceArchiveKey: `by-source/test/${entry.sourceVersion}.zip`,
        sourceArchiveSha256,
        sourceVersion: entry.sourceVersion,
      })

      expect(result).toEqual({ rowCount: entry.rowCount })
      const file = await asyncBufferFromFile(outputFile)
      const rows = await parquetReadObjects({
        compressors,
        file,
        metadata: await parquetMetadataAsync(file),
      })
      expect(rows).toHaveLength(entry.rowCount)
      expect(rows[0]).toMatchObject({
        dataset_code: entry.datasetCode,
        reference_period_code: expectedFirstReferencePeriod(
          entry.datasetCode,
          entry.sourceVersion,
        ),
      })
      expect(JSON.parse(String(rows[0]?.sources))).toEqual([
        {
          dataset: 'hkgov-censtatd',
          layerName: String(rows[0]?.layer_name),
          sourceArchiveKey: `by-source/test/${entry.sourceVersion}.zip`,
          sourceArchiveSha256,
        },
      ])
    })
  }

  test('rejects an archive without its profile layer', async () => {
    const dir = await unpack(CASES[2]!.archive)
    await expect(
      prepareHkgovCenstatdStatisticUpload({
        datasetCode: CASES[2]!.datasetCode,
        inputFiles: {},
        outputFile: join(dir, 'statistics.parquet'),
        sourceArchiveKey: 'by-source/test/missing.zip',
        sourceArchiveSha256: 'a'.repeat(64),
        sourceVersion: '2021',
      }),
    ).rejects.toThrow('CSDI archive is missing NewTown_21C.gml.')
  })

  test('fans native Area/type and HMA polygons into reviewed division contracts', async () => {
    for (const entry of [CASES[0]!, CASES[3]!]) {
      const dir = await unpack(entry.archive)
      const archive = unzipSync(await readFile(resolve(REPO_ROOT, entry.archive)))
      const inputGml = Object.fromEntries(
        Object.entries(archive)
          .filter(([name]) => name.endsWith('.gml'))
          .map(([name, content]) => [name, new TextDecoder().decode(content)]),
      )
      const divisionOutputFile = join(dir, 'division.parquet')
      const areaOutputFile = join(dir, 'division-area.parquet')
      const result = await prepareHkgovCenstatdStatisticGeographyUploads({
        areaOutputFile,
        datasetCode: entry.datasetCode,
        divisionOutputFile,
        inputGml,
        sourceArchiveKey: 'by-source/test/source.zip',
        sourceArchiveSha256: 'a'.repeat(64),
        sourceVersion: entry.sourceVersion,
      })
      expect(result.divisionCount).toBe(
        entry.datasetCode.includes('housing-market') ? 173 : 0,
      )
      expect(result.areaCount).toBe(
        entry.datasetCode.includes('housing-market') ? 173 : 3,
      )
      if (result.divisionCount > 0) {
        const divisionFile = await asyncBufferFromFile(divisionOutputFile)
        const divisions = await parquetReadObjects({
          compressors,
          file: divisionFile,
          metadata: await parquetMetadataAsync(divisionFile),
        })
        expect(divisions).toHaveLength(result.divisionCount)
        expect(divisions[0]).toMatchObject({
          canonical_type: 'housing-market-area',
          class: 'housing-market-area',
          source: 'hkgov-censtatd',
          subtype: '',
        })
        expect(divisions[0]).toHaveProperty('parent_division_id', '')
        expect(divisions[0]).not.toHaveProperty('canonical_level')
      }
    }
    for (const area of overtureHongKongAreas) {
      expect(
        hkgovCenstatdStatisticDivisionId(
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
          area.censtatdCode,
        ),
      ).toBe(overtureHongKongAreaDivisionId(area.code))
    }
  })
})

function expectedFirstReferencePeriod(datasetCode: string, sourceVersion: string) {
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  ) {
    return '2016'
  }
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type'
  ) {
    return '2023'
  }
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'
  ) {
    return '2023-Q3'
  }
  return sourceVersion
}

async function unpack(archive: string) {
  const dir = await mkdtemp(join(tmpdir(), 'hkgov-censtatd-statistics-test-'))
  workDirs.push(dir)
  const files = unzipSync(await readFile(resolve(REPO_ROOT, archive)))
  await Promise.all(
    Object.entries(files).map(([name, bytes]) => writeFile(join(dir, name), bytes)),
  )
  return dir
}

async function gmlFiles(dir: string) {
  const names = await readdir(dir)
  return Object.fromEntries(
    names.filter(name => name.endsWith('.gml')).map(name => [name, join(dir, name)]),
  ) as Record<string, string>
}
