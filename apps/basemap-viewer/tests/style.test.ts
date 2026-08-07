import { describe, expect, it } from 'vitest'
import type {
  LineLayerSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import {
  applyVisibility,
  createPostcardStyle,
  createStyle,
  earthColor,
  firstTextSymbolLayerId,
  labelExpression,
  postcardPalette,
  waterColor,
} from '../src/lib/style'
import { defaultState } from '../src/lib/ctx/app'

describe('basemap style', () => {
  it('uses one vector source when labels do not need filtering', () => {
    const { style } = createStyle('https://tiles.example/hongkong-2026-03-18.json')
    expect(style.sources.basemap).toEqual({
      attribution:
        '<a href="https://openstreetmap.org/copyright">OpenStreetMaps (ODbL)</a>; <a href="https://protomaps.com/legal">Protomaps</a>',
      type: 'vector',
      url: 'https://tiles.example/hongkong-2026-03-18.json',
    })
    expect(style.glyphs).toContain('klokantech-gl-fonts')
    expect(JSON.stringify(style.layers)).not.toContain('"Noto Sans Regular"')
    expect(style.layers.map(layer => layer.id)).toEqual(
      expect.arrayContaining([
        'earth',
        'water',
        'water_coastline',
        'buildings',
        'pois-point',
        'pois-label',
      ]),
    )
  })

  it('renders source-local coastlines through the Protomaps water layer', () => {
    const { style } = createStyle('https://tiles.example/hongkong-latest.json')
    expect(style.layers.find(layer => layer.id === 'water_coastline')).toMatchObject({
      type: 'line',
      source: 'basemap',
      'source-layer': 'water',
      filter: ['==', 'kind', 'coastline'],
      minzoom: 6,
    })
  })

  it('builds a regional, geometry-only postcard style', () => {
    const { style } = createPostcardStyle(
      'https://tiles.example/hongkong-latest.json',
      'hk',
    )
    const layerIds = style.layers.map(layer => layer.id)
    expect(postcardPalette('hk')).toEqual({
      accent: '#C83D3D',
      coast: '#D99393',
      road: '#E7A3A3',
    })
    expect(layerIds).toEqual(
      expect.arrayContaining([
        'earth',
        'landuse_park',
        'water',
        'water_coastline',
        'roads_major',
        'roads_highway',
      ]),
    )
    expect(layerIds.some(id => id.includes('label') || id === 'pois-point')).toBe(false)
    expect(style.layers.find(layer => layer.id === 'earth')?.paint).toMatchObject({
      'fill-color': '#F6ECD8',
    })
    expect(style.layers.find(layer => layer.id === 'water')?.paint).toMatchObject({
      'fill-color': '#D7E6E4',
    })
    expect(JSON.stringify(style.layers)).toContain('#B7C99E')
    expect(JSON.stringify(style.layers)).toContain('#DFC17B')
    expect(JSON.stringify(style.layers)).toContain('#CEDAB9')
    expect(
      style.layers.find(layer => layer.id === 'water_coastline')?.paint,
    ).toMatchObject({ 'line-color': '#D99393', 'line-opacity': 0.72 })
    expect(style.layers.find(layer => layer.id === 'roads_major')?.paint).toMatchObject(
      {
        'line-color': '#E7A3A3',
      },
    )
  })

  it('reduces Macao road widths while preserving their zoom interpolation', () => {
    const { style } = createPostcardStyle(
      'https://tiles.example/macau-latest.json',
      'mo',
    )
    const roadsMajor = style.layers.find(
      (layer): layer is LineLayerSpecification =>
        layer.id === 'roads_major' && layer.type === 'line',
    )
    expect(roadsMajor?.paint?.['line-width']).toEqual([
      'interpolate',
      ['exponential', 1.6],
      ['zoom'],
      6,
      0,
      12,
      0.992,
      15,
      1.8599999999999999,
      18,
      8.06,
    ])
  })

  it('uses the regional accent colour for illuminated postcard roads', () => {
    const { style } = createPostcardStyle(
      'https://tiles.example/hongkong-latest.json',
      'hk',
      undefined,
      true,
    )
    const roadsMajor = style.layers.find(
      (layer): layer is LineLayerSpecification =>
        layer.id === 'roads_major' && layer.type === 'line',
    )
    expect(roadsMajor?.paint?.['line-color']).toBe('#C83D3D')
  })

  it('keeps repeated road-direction arrows below the boundary mask insertion point', () => {
    const { style } = createStyle('https://tiles.example/hongkong-latest.json')
    const layerIds = style.layers.map(layer => layer.id)
    expect(layerIds.indexOf('roads_oneway')).toBeLessThan(
      layerIds.indexOf('address_label'),
    )
  })

  it('builds each Protomaps built-in theme with its matching sprite', () => {
    const { style } = createStyle(
      'https://tiles.example/hongkong-latest.json',
      undefined,
      'dark',
    )
    expect(style.sprite).toBe(
      'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    )
  })

  it('exposes the earth and water colours used by regional coverage', () => {
    expect(earthColor('light')).toBe('#e2dfda')
    expect(earthColor('dark')).toBe('#1f1f1f')
    expect(earthColor('midnight')).toBe('#0D3036')
    expect(waterColor('light')).toBe('#80deea')
    expect(waterColor('dark')).toBe('#31353f')
    expect(waterColor('midnight')).toBe('#061426')
  })

  it('renders Midnight with restrained road hierarchy and high-contrast labels', () => {
    const { style } = createStyle(
      'https://tiles.example/hongkong-latest.json',
      undefined,
      'midnight',
    )
    expect(style.sprite).toBe(
      'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    )
    expect(style.layers.find(layer => layer.id === 'earth')?.paint).toMatchObject({
      'fill-color': '#0D3036',
    })
    expect(style.layers.find(layer => layer.id === 'water')?.paint).toMatchObject({
      'fill-color': '#061426',
    })
    expect(
      JSON.stringify(style.layers.find(layer => layer.id === 'roads_minor')?.paint),
    ).toContain('#2185A8')
    expect(
      style.layers.some(
        layer =>
          layer.type === 'line' &&
          layer.id === 'roads_highway' &&
          layer.paint?.['line-color'] === '#6BEAF5',
      ),
    ).toBe(true)
    const textLayers = style.layers.filter(
      (layer): layer is SymbolLayerSpecification =>
        layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined,
    )
    expect(
      textLayers.every(
        layer =>
          layer.paint?.['text-color'] === '#F8FAFC' &&
          layer.paint?.['text-halo-color'] === '#020617' &&
          layer.paint?.['text-halo-width'] === 1.5 &&
          layer.paint?.['text-halo-blur'] === 0,
      ),
    ).toBe(true)
    expect(style.layers.some(layer => layer.id.endsWith('-glow'))).toBe(false)
  })

  it('uses name fallback expressions and honours dependent labels', () => {
    expect(labelExpression('en')).toEqual([
      'coalesce',
      ['get', 'name:en'],
      ['get', 'name'],
    ])
    expect(labelExpression('zh-Hant')).toEqual([
      'coalesce',
      ['get', 'name:zh-Hant'],
      ['get', 'name'],
    ])
    const { groups } = createStyle('https://tiles.example/hongkong-latest.json')
    const state = defaultState()
    state.features.roads = false
    state.features.landuse = false
    state.labels.roads = true
    const calls: Array<[string, string]> = []
    applyVisibility((id, visibility) => calls.push([id, visibility]), groups, state)
    expect(calls).toContainEqual(['roads_labels_minor', 'none'])
    expect(calls).toContainEqual(['landuse_park', 'none'])
  })

  it('provides a label insertion point for geometry-only overlays', () => {
    const { style } = createStyle('https://tiles.example/hongkong-latest.json')
    expect(firstTextSymbolLayerId(style.layers)).toBe('address_label')
  })
})
