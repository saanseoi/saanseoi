import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { prepareHkgovCenstatdDistrictUpload } from './hkgovCenstatd.ts'

const districtClasses = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
]

describe('C&SD district GML preparation', () => {
  test('retains exact source geometry and produces display derivatives for both census cohorts', async () => {
    const inputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-input-'))
    const outputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-test-'))
    const inputFile = join(inputDir, 'censtatd-2021.gml')
    const members = districtClasses.map((districtClass, index) => {
      const north = 816_000 + index * 1_000
      const east = 829_000 + index * 1_000
      return `
        <wfs:member>
          <csdi:DC_21C_SDU gml:id="district-${districtClass}">
            <csdi:dc>${index + 11}.00000000</csdi:dc>
            <csdi:dc_chi>地區${index + 1}</csdi:dc_chi>
            <csdi:dc_class>${districtClass}</csdi:dc_class>
            <csdi:dc_eng>District ${index + 1}</csdi:dc_eng>
            <csdi:sdu_pop>${index}</csdi:sdu_pop>
            <csdi:SHAPE>
              <gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::2326">
                <gml:surfaceMember>
                  <gml:Polygon>
                    <gml:exterior><gml:LinearRing><gml:posList>
                      ${north} ${east} ${north} ${east + 100} ${north + 100} ${east + 100} ${north + 100} ${east} ${north} ${east}
                    </gml:posList></gml:LinearRing></gml:exterior>
                  </gml:Polygon>
                </gml:surfaceMember>
              </gml:MultiSurface>
            </csdi:SHAPE>
          </csdi:DC_21C_SDU>
        </wfs:member>`
    })
    const document = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:csdi="https://portal.csdi.gov.hk">${members.join('')}</wfs:FeatureCollection>`
    await writeFile(inputFile, document, 'utf8')

    try {
      const exact = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2021',
      )
      const display = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2021',
        { transform: 'simplified' },
      )
      const displayFile = await asyncBufferFromFile(display.filePath)
      const displayMetadata = await parquetMetadataAsync(displayFile)
      const displayRows = await parquetReadObjects({
        file: displayFile,
        metadata: displayMetadata,
        compressors,
      })

      expect(exact).toMatchObject({
        cohortKey: '2021',
        source: 'hkgov-censtatd',
        sourceVersion: '2021',
        type: 'divisionArea',
      })
      expect(display).toMatchObject({
        cohortKey: '2021',
        source: 'hkgov-censtatd',
        sourceVersion: '2021-simplified-v1',
        transform: 'simplified',
        type: 'divisionArea',
      })
      expect(Number(displayMetadata.num_rows)).toBe(18)
      expect(displayRows[0]).toMatchObject({
        census_year: '2021',
        derivation: {
          method: 'topology-preserving-simplification',
          preservesLandClip: true,
          toleranceMetres: 10,
        },
        district_class: 'A',
        geometry: { type: 'Polygon' },
        id: 'CENSTATD:simplified:2021:A',
        i18n: [
          { locale: 'en', name: 'District 1' },
          { locale: 'zh-hant', name: '地區1' },
        ],
        source_crs: 'EPSG:2326',
        source_geometry: { type: 'MultiPolygon' },
        source_feature: { type: 'GML32Feature' },
        source_properties: { dc_class: 'A', sdu_pop: '0' },
      })

      await writeFile(
        inputFile,
        document.replaceAll('DC_21C_SDU', 'DC_16BC_SDU'),
        'utf8',
      )
      const display2016 = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2016',
        { transform: 'simplified' },
      )

      expect(display2016).toMatchObject({
        cohortKey: '2016',
        sourceVersion: '2016-simplified-v1',
        transform: 'simplified',
      })
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
