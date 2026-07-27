import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { prepareHkgovCenstatdDistrictStatisticUpload } from './hkgovCenstatdDistrictStatistics.ts'

const workDirs: string[] = []
afterEach(async () => {
  await Promise.all(
    workDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  )
})

describe('C&SD district land-area statistics', () => {
  test('requires and prepares the 18 native Density_2022 GML assertions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hkgov-censtatd-density-test-'))
    workDirs.push(dir)
    const inputFile = join(dir, 'Density_2022.gml')
    const outputFile = join(dir, 'density.parquet')
    await writeFile(inputFile, gml('2022'))
    const result = await prepareHkgovCenstatdDistrictStatisticUpload({
      inputFile,
      outputFile,
      sourceArchiveKey: 'by-source/test.zip',
      sourceVersion: '2022',
    })
    expect(result).toEqual({ outputFile, rowCount: 18 })
  })
})

function gml(year: string) {
  return `<?xml version="1.0"?><geodatastore:FeatureCollection xmlns:geodatastore="http://ogr.maptools.org/" xmlns:gml="http://www.opengis.net/gml/3.2">${Array.from({ length: 18 }, (_, index) => `<geodatastore:featureMember><geodatastore:Density_${year}><geodatastore:geometryProperty><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::2326"><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>800000 800000 800010 800000 800010 800010 800000 800000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></geodatastore:geometryProperty><geodatastore:DC>${index + 1}</geodatastore:DC><geodatastore:DC_ENG>District ${index + 1}</geodatastore:DC_ENG><geodatastore:DC_CHI>區${index + 1}</geodatastore:DC_CHI><geodatastore:PERIOD>${year}</geodatastore:PERIOD><geodatastore:LA>1.5</geodatastore:LA><geodatastore:MYPOPN_LAND>2.5</geodatastore:MYPOPN_LAND><geodatastore:POPN_D>3</geodatastore:POPN_D></geodatastore:Density_${year}></geodatastore:featureMember>`).join('')}</geodatastore:FeatureCollection>`
}
