import { describe, expect, test } from 'bun:test'
import { parseCsdiGml } from './hkgovCenstatdStatistics'
import { normaliseCenstatdProperty } from './hkgovCenstatdProperties'

const dataset = 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'

function parseProperties(layer: string, attributes: Record<string, string>) {
  return parseCsdiGml(
    `<FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2"><featureMember><${layer} gml:id="T">${Object.entries(
      attributes,
    )
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join(
        '',
      )}<geometryProperty><gml:Point><gml:pos>812345.123456789 823456.987654321</gml:pos></gml:Point></geometryProperty></${layer}></featureMember></FeatureCollection>`,
    layer,
    dataset,
  )[0]!
}

describe('C&SD subdivided-unit numeric properties', () => {
  for (const layer of ['DC_16BC_SDU', 'DC_21C_SDU']) {
    test(`${layer} normalises counts and measurements before source persistence`, () => {
      const row = parseProperties(layer, {
        dc: '39.00000000',
        dc_class: 'T',
        dc_eng: 'Islands',
        OBJECTID: '18',
        sdu_dh: '704.00000000',
        sdu_n: '704.00000000',
        sdu_oq: '308.00000000',
        sdu_pop: '1970.00000000',
        SHAPE_Length: '325416.82803590',
        SHAPE_Area: '180186992.01805571',
        unknown_code: '001.00000000',
      })
      expect(row.properties).toEqual({
        dc: 39,
        dc_class: 'T',
        dc_eng: 'Islands',
        OBJECTID: 18,
        sdu_dh: 704,
        sdu_n: 704,
        sdu_oq: 308,
        sdu_pop: 1970,
        SHAPE_Length: 325416.83,
        SHAPE_Area: 180186992.02,
        unknown_code: '001.00000000',
      })
      expect(row.sourceGeometry).toEqual({
        'gml:Point': { 'gml:pos': '812345.123456789 823456.987654321' },
      })
      expect(row.sourceRecordId).toBe('T')
    })
  }

  test('preserves missing values and suppression markers', () => {
    expect(
      parseProperties('DC_21C_SDU', { sdu_pop: '-', sdu_dh: '', sdu_n: '**' })
        .properties,
    ).toEqual({ sdu_pop: '-', sdu_dh: '', sdu_n: '**' })
  })

  test('rejects fractional or unsafe counts rather than rounding them', () => {
    for (const value of ['704.5', '9007199254740993']) {
      expect(() => parseProperties('DC_21C_SDU', { sdu_pop: value })).toThrow(
        'must be a safe integer',
      )
    }
  })
})

describe('C&SD statistical numeric properties', () => {
  for (const layer of [
    'BG_21C',
    'HMA_21C',
    'MHE_21C',
    'NewTown_21C',
    'DC_GHS',
    'DCD_LQ_Q32023',
    'Density_2022',
    'Density_2024',
    'AREA_LQ_2023',
  ]) {
    test(`${layer} parses measures without changing codes, periods or missing values`, () => {
      for (const field of ['t_pop', 'LQ', 'dh', 'POPN_D']) {
        expect(normaliseCenstatdProperty(layer, field, '1331.00000000')).toBe(1331)
      }
      for (const field of [
        'bg',
        'hma',
        'estate',
        'newtown',
        'DC',
        'YEAR',
        'QUARTER',
        'PERIOD',
        'dc_eng',
      ]) {
        expect(normaliseCenstatdProperty(layer, field, '001')).toBe('001')
      }
      expect(normaliseCenstatdProperty(layer, 't_ma', '46.712345')).toBe(46.712345)
      expect(normaliseCenstatdProperty(layer, 't_pop', '**')).toBe('**')
      expect(normaliseCenstatdProperty(layer, 't_pop', '')).toBe('')
      const nil = { '@_xsi:nil': 'true' }
      expect(normaliseCenstatdProperty(layer, 't_pop', nil)).toBe(nil)
    })
  }
  test('leaves other datasets alone and rejects unsafe numeric values', () => {
    expect(normaliseCenstatdProperty('Other', 't_pop', '1331.000')).toBe('1331.000')
    expect(() => normaliseCenstatdProperty('DC_GHS', 'dh', '9007199254740993')).toThrow(
      'safe integer',
    )
  })
})
