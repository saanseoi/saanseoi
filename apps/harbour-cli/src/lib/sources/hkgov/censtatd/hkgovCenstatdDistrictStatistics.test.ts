import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { prepareHkgovCenstatdDistrictStatisticUpload } from './hkgovCenstatdDistrictStatistics.ts'

const workDirs: string[] = []
afterEach(async () => {
  await Promise.all(
    workDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  )
})

describe('C&SD district land-area statistics', () => {
  test('requires and prepares the 18 native Density_2022 GML records', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hkgov-censtatd-density-test-'))
    workDirs.push(dir)
    const inputFile = join(dir, 'Density_2022.gml')
    const outputFile = join(dir, 'density.parquet')
    await writeFile(inputFile, gml('2022'))
    const result = await prepareHkgovCenstatdDistrictStatisticUpload({
      inputFile,
      outputFile,
      sourceArchiveKey: 'by-source/test.zip',
      sourceArchiveSha256: 'a'.repeat(64),
      sourceVersion: '2022',
    })
    expect(result).toEqual({ outputFile, rowCount: 18 })
    const file = await asyncBufferFromFile(outputFile)
    const rows = await parquetReadObjects({
      compressors,
      file,
      metadata: await parquetMetadataAsync(file),
    })
    expect(rows[0]).toMatchObject({
      district_code: BigInt(11),
      mid_year_population: BigInt(2500),
    })
    expect(JSON.parse(String(rows[0]?.sources))).toEqual([
      {
        dataset: 'hkgov-censtatd',
        districtCode: 11,
        sourceArchiveKey: 'by-source/test.zip',
        sourceArchiveSha256: 'a'.repeat(64),
      },
    ])
  })

  test('rejects duplicate publisher DC records', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hkgov-censtatd-density-test-'))
    workDirs.push(dir)
    const inputFile = join(dir, 'Density_2022.gml')
    await writeFile(
      inputFile,
      gml(
        '2022',
        [11, 11, 13, 14, 23, 24, 25, 26, 27, 31, 32, 33, 34, 35, 36, 37, 38, 39],
      ),
    )

    await expect(
      prepareHkgovCenstatdDistrictStatisticUpload({
        inputFile,
        outputFile: join(dir, 'density.parquet'),
        sourceArchiveKey: 'by-source/test.zip',
        sourceArchiveSha256: 'a'.repeat(64),
        sourceVersion: '2022',
      }),
    ).rejects.toThrow('C&SD Density GML contains duplicate DC values.')
  })

  test('converts decimal thousands to whole people without floating-point loss', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hkgov-censtatd-density-test-'))
    workDirs.push(dir)
    const inputFile = join(dir, 'Density_2022.gml')
    const outputFile = join(dir, 'density.parquet')
    await writeFile(inputFile, gml('2022', undefined, '518.2'))

    await prepareHkgovCenstatdDistrictStatisticUpload({
      inputFile,
      outputFile,
      sourceArchiveKey: 'by-source/test.zip',
      sourceArchiveSha256: 'a'.repeat(64),
      sourceVersion: '2022',
    })
    const file = await asyncBufferFromFile(outputFile)
    const rows = await parquetReadObjects({
      compressors,
      file,
      metadata: await parquetMetadataAsync(file),
    })
    expect(rows[0]).toMatchObject({ mid_year_population: BigInt(518_200) })
  })
})

function gml(
  year: string,
  districtCodes = [
    11, 12, 13, 14, 23, 24, 25, 26, 27, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  ],
  population = '2.5',
) {
  return `<?xml version="1.0"?><geodatastore:FeatureCollection xmlns:geodatastore="http://ogr.maptools.org/" xmlns:gml="http://www.opengis.net/gml/3.2">${districtCodes.map((districtCode, index) => `<geodatastore:featureMember><geodatastore:Density_${year}><geodatastore:geometryProperty><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::2326"><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>800000 800000 800010 800000 800010 800010 800000 800000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></geodatastore:geometryProperty><geodatastore:DC>${districtCode}</geodatastore:DC><geodatastore:DC_ENG>District ${index + 1}</geodatastore:DC_ENG><geodatastore:DC_CHI>區${index + 1}</geodatastore:DC_CHI><geodatastore:PERIOD>${year}</geodatastore:PERIOD><geodatastore:LA>1.5</geodatastore:LA><geodatastore:MYPOPN_LAND>${population}</geodatastore:MYPOPN_LAND><geodatastore:POPN_D>3</geodatastore:POPN_D></geodatastore:Density_${year}></geodatastore:featureMember>`).join('')}</geodatastore:FeatureCollection>`
}
