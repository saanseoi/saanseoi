import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { strFromU8 } from 'fflate'

import {
  prepareHkgovCenstatdDistrictUpload,
  readHkgovCenstatdDistrictGmlArchive,
} from './hkgovCenstatd.ts'
import { parseHkgovCenstatdDistrictGml } from './hkgovCenstatdGml.ts'
import { readSafeZipArchive } from '../zipArchive.ts'

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
  test('reads both native CSDI archives with the same district coverage and source geometry as their historical GML', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../../')
    for (const source of [
      {
        archive: 'censtatd_rcd_1635932488538_10765/2026-Q2/source.zip',
        layer: 'DC_16BC_SDU',
        sourceVersion: '2016',
      },
      {
        archive: 'censtatd_rcd_1635933617052_68946/2026-Q2/source.zip',
        layer: 'DC_21C_SDU',
        sourceVersion: '2021',
      },
    ] as const) {
      const [archive, baseline] = await Promise.all([
        readFile(join(repoRoot, 'data/hkgov/csdi/archive', source.archive)),
        readFile(
          join(
            repoRoot,
            `data/hkgov/censtatd/district-council-districts-${source.sourceVersion}.gml`,
          ),
          'utf8',
        ),
      ])
      const nativeFeatures = parseHkgovCenstatdDistrictGml(
        readHkgovCenstatdDistrictGmlArchive(archive, source.sourceVersion),
        source.layer,
      )
      const baselineFeatures = parseHkgovCenstatdDistrictGml(baseline, source.layer)

      expect(nativeFeatures).toHaveLength(18)
      expect(nativeFeatures.map(feature => feature.properties.dc_class).sort()).toEqual(
        baselineFeatures.map(feature => feature.properties.dc_class).sort(),
      )
      expect(geometryProfilesByDistrictClass(nativeFeatures)).toEqual(
        geometryProfilesByDistrictClass(baselineFeatures),
      )
    }
  })

  test('extracts the 2024 DC_GHS district cohort that is identical to Density_2024', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../../')
    const inputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-input-'))
    const outputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-output-'))
    try {
      const [districtArchive, densityArchive] = await Promise.all([
        readFile(
          join(
            repoRoot,
            'data/hkgov/csdi/archive/censtatd_rcd_1635934545173_69201/2025-Q2/source.zip',
          ),
        ),
        readFile(
          join(
            repoRoot,
            'data/hkgov/csdi/archive/censtatd_rcd_1635934215448_25451/2025-Q3/source.zip',
          ),
        ),
      ])
      const inputFile = join(inputDir, 'district-council-districts-2024.gml')
      await writeFile(
        inputFile,
        readHkgovCenstatdDistrictGmlArchive(
          districtArchive,
          '2024',
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        ),
        'utf8',
      )
      const prepared = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2024',
        {
          datasetCode:
            'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        },
      )
      const displayPrepared = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2024',
        {
          datasetCode:
            'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
          transform: 'simplified',
        },
      )
      const file = await asyncBufferFromFile(prepared.filePath)
      const rows = await parquetReadObjects({
        compressors,
        file,
        metadata: await parquetMetadataAsync(file),
      })
      const displayFile = await asyncBufferFromFile(displayPrepared.filePath)
      const displayRows = await parquetReadObjects({
        compressors,
        file: displayFile,
        metadata: await parquetMetadataAsync(displayFile),
      })
      const densityGml = strFromU8(
        readSafeZipArchive(densityArchive, {
          select: name => name === 'Density_2024.gml',
        }).entries['Density_2024.gml']!,
      )
      const densityByCode = new Map(
        parseHkgovCenstatdDistrictGml(densityGml, 'Density_2024').map(feature => [
          Number(feature.properties.DC),
          feature.sourceGeometry,
        ]),
      )

      expect(prepared).toMatchObject({ cohortKey: '2024', sourceVersion: '2024' })
      expect(rows).toHaveLength(18)
      expect(rows.map(row => row.census_year)).toEqual(Array(18).fill('2024'))
      expect(displayRows[0]).toMatchObject({
        derivation: { preservesPublisherGeometry: true },
      })
      for (const row of rows) {
        expect(row.source_geometry).toEqual(
          densityByCode.get(Number(row.district_code)),
        )
      }
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })

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
        {
          sourceArchive: {
            key: 'by-source/hk/hkgov-csdi/districts/source.zip',
            sha256: 'a'.repeat(64),
          },
        },
      )
      const display = await prepareHkgovCenstatdDistrictUpload(
        inputFile,
        outputDir,
        '2021',
        {
          sourceArchive: {
            key: 'by-source/hk/hkgov-csdi/districts/source.zip',
            sha256: 'a'.repeat(64),
          },
          transform: 'simplified',
        },
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
        sourceVersion: '2021',
        transform: 'simplified',
        type: 'divisionArea',
      })
      expect(Number(displayMetadata.num_rows)).toBe(18)
      expect(displayRows[0]).toMatchObject({
        census_year: '2021',
        derivation: {
          method: 'geos-coverage-simplification',
          preservesLandClip: true,
          toleranceMetres: 10,
        },
        district_class: 'A',
        geometry: { type: 'Polygon' },
        id: 'CENSTATD:A',
        source_geometry: { type: 'MultiPolygon' },
        source_properties: {
          dc_chi: '地區1',
          dc_class: 'A',
          dc_eng: 'District 1',
          sdu_pop: '0',
        },
        sources: [
          {
            dataset: 'hkgov-censtatd',
            districtClass: 'A',
            districtCode: 11,
            sourceArchiveKey: 'by-source/hk/hkgov-csdi/districts/source.zip',
            sourceArchiveSha256: 'a'.repeat(64),
          },
        ],
      })
      expect(displayRows[0]).not.toHaveProperty('i18n')
      expect(displayRows[0]).not.toHaveProperty('source_feature')

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
        sourceVersion: '2016',
        transform: 'simplified',
      })
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})

function geometryProfilesByDistrictClass(
  features: Array<{ properties: Record<string, unknown>; sourceGeometry: unknown }>,
) {
  const entries: Array<[string, ReturnType<typeof geometryProfile>]> = features.map(
    feature => [
      String(feature.properties.dc_class),
      geometryProfile(feature.sourceGeometry),
    ],
  )
  return Object.fromEntries(
    entries.sort(([first], [second]) => first.localeCompare(second)),
  )
}

function geometryProfile(value: unknown) {
  const positions: Array<[number, number]> = []
  const visit = (candidate: unknown): void => {
    if (
      Array.isArray(candidate) &&
      candidate.length >= 2 &&
      typeof candidate[0] === 'number' &&
      typeof candidate[1] === 'number'
    ) {
      positions.push([candidate[0], candidate[1]])
      return
    }
    if (Array.isArray(candidate)) candidate.forEach(visit)
    else if (candidate && typeof candidate === 'object') {
      const coordinates = (candidate as { coordinates?: unknown }).coordinates
      if (coordinates) visit(coordinates)
    }
  }
  visit(value)
  return {
    maxX: rounded(Math.max(...positions.map(([x]) => x))),
    maxY: rounded(Math.max(...positions.map(([, y]) => y))),
    minX: rounded(Math.min(...positions.map(([x]) => x))),
    minY: rounded(Math.min(...positions.map(([, y]) => y))),
    vertexCount: positions.length,
  }
}

function rounded(value: number) {
  return Math.round(value * 100) / 100
}
