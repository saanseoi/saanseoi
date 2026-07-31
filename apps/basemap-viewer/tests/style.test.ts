import { describe, expect, it } from 'vitest'
import type { SymbolLayerSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  applyVisibility,
  createStyle,
  earthColor,
  firstTextSymbolLayerId,
  labelExpression,
  waterColor,
} from '../src/lib/style'
import { defaultState } from '../src/lib/ctx/app'

describe('basemap style', () => {
  it('uses one TileJSON vector source and CJK-capable glyph configuration', () => {
    const { style } = createStyle('https://tiles.example/hongkong-2026-03-18.json')
    expect(style.sources.basemap).toEqual({
      attribution:
        '<a href="https://openstreetmap.org/copyright">OpenStreetMaps (ODbL)</a>; <a href="https://protomaps.com/legal">Protomaps</a>',
      type: 'vector',
      url: 'https://tiles.example/hongkong-2026-03-18.json',
    })
    expect(style.glyphs).toContain('klokantech-gl-fonts')
    expect(style.sources['basemap-labels']).toEqual({
      attribution:
        '<a href="https://openstreetmap.org/copyright">OpenStreetMaps (ODbL)</a>; <a href="https://protomaps.com/legal">Protomaps</a>',
      type: 'vector',
      url: 'https://tiles.example/hongkong-2026-03-18.json',
    })
    expect(JSON.stringify(style.layers)).not.toContain('"Noto Sans Regular"')
    expect(style.layers.map(layer => layer.id)).toEqual(
      expect.arrayContaining([
        'earth',
        'water',
        'buildings',
        'pois-point',
        'pois-label',
      ]),
    )
  })

  it('draws symbols from the boundary-filtered label source', () => {
    const { style } = createStyle(
      'https://tiles.example/hongkong-latest.json',
      undefined,
      'light',
      'https://tiles.example/hongkong-latest.json?labels=inside',
    )
    expect(
      style.layers
        .filter(layer => layer.type === 'symbol')
        .every(layer => layer.source === 'basemap-labels'),
    ).toBe(true)
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
    state.labels.roads = true
    const calls: Array<[string, string]> = []
    applyVisibility((id, visibility) => calls.push([id, visibility]), groups, state)
    expect(calls).toContainEqual(['roads_labels_minor', 'none'])
  })

  it('provides a label insertion point for geometry-only overlays', () => {
    const { style } = createStyle('https://tiles.example/hongkong-latest.json')
    expect(firstTextSymbolLayerId(style.layers)).toBe('address_label')
  })
})
