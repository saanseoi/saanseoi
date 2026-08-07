import { LIGHT, layers, type Flavor } from '@protomaps/basemaps'
import type {
  ExpressionSpecification,
  LineLayerSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import type { FeatureKey, LabelKey, Locale, Theme, VisibilityState } from './types'
import { BASEMAP_ATTRIBUTION, mapStyleFlavor } from '@repo/basemap'

export const BASEMAP_SOURCE_ID = 'basemap'
export const GLYPH_URL =
  'https://raw.githubusercontent.com/klokantech/klokantech-gl-fonts/master/{fontstack}/{range}.pbf'
const SPRITE_BASE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4'
const CJK_FONT_NAME = 'KlokanTech Noto Sans CJK Regular'
const CJK_FONT = [CJK_FONT_NAME]
const MIDNIGHT_LABEL_COLOR = '#F8FAFC'
const MIDNIGHT_LABEL_HALO = '#020617'

type PostcardPalette = {
  accent: string
  coast: string
  road: string
}

const POSTCARD_PALETTES = {
  hk: { accent: '#C83D3D', coast: '#D99393', road: '#E7A3A3' },
  mo: { accent: '#00856A', coast: '#72B4A4', road: '#85C9B8' },
  gba: { accent: '#287FA3', coast: '#8DB8CA', road: '#82B4CD' },
} as const satisfies Record<string, PostcardPalette>

const POSTCARD_LAYER_IDS = new Set([
  'background',
  'earth',
  'landcover',
  'water',
  'water_stream',
  'water_river',
  'boundaries_country',
  'roads_major_casing_late',
  'roads_highway_casing_late',
  'roads_major_casing_early',
  'roads_major',
  'roads_highway_casing_early',
  'roads_highway',
  'roads_bridges_major_casing',
  'roads_bridges_major',
  'roads_bridges_highway_casing',
  'roads_bridges_highway',
])

export type LayerGroups = Record<FeatureKey | LabelKey, string[]>

/** The regional palette used by the renderer-only basemap postcards. */
export function postcardPalette(
  regionCode: string | null | undefined,
): PostcardPalette {
  return (
    POSTCARD_PALETTES[regionCode as keyof typeof POSTCARD_PALETTES] ??
    POSTCARD_PALETTES.gba
  )
}

export function labelExpression(locale: Locale): ExpressionSpecification {
  return ['coalesce', ['get', `name:${locale}`], ['get', 'name']]
}

function isTextSymbol(layer: LayerSpecification): layer is SymbolLayerSpecification {
  return layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined
}

/**
 * Returns the first text layer in the style.  Overlays inserted before this
 * layer conceal map geometry while leaving all text labels above the overlay.
 */
export function firstTextSymbolLayerId(
  styleLayers: readonly LayerSpecification[],
): string | undefined {
  return styleLayers.find(isTextSymbol)?.id
}

function copyPoiLayers(styleLayers: LayerSpecification[]): LayerSpecification[] {
  return styleLayers.flatMap(layer => {
    if (layer.id !== 'pois' || !isTextSymbol(layer)) return [layer]
    const pointLayout = { ...layer.layout }
    delete pointLayout['text-field']
    delete pointLayout['text-font']
    delete pointLayout['text-size']
    delete pointLayout['text-offset']
    delete pointLayout['text-anchor']
    const labelLayout = { ...layer.layout }
    delete labelLayout['icon-image']
    delete labelLayout['icon-size']
    delete labelLayout['icon-allow-overlap']
    delete labelLayout['icon-ignore-placement']
    return [
      { ...layer, id: 'pois-point', layout: pointLayout },
      { ...layer, id: 'pois-label', layout: labelLayout },
    ]
  })
}

function moveRoadDirectionArrowsBelowLabels(
  styleLayers: LayerSpecification[],
): LayerSpecification[] {
  const arrows = styleLayers.filter(layer => layer.id === 'roads_oneway')
  if (arrows.length === 0) return styleLayers
  const remaining = styleLayers.filter(layer => layer.id !== 'roads_oneway')
  const firstTextIndex = remaining.findIndex(isTextSymbol)
  if (firstTextIndex === -1) return [...remaining, ...arrows]
  return [
    ...remaining.slice(0, firstTextIndex),
    ...arrows,
    ...remaining.slice(firstTextIndex),
  ]
}

/** Render SaanSeoi's source-local coastlines through Protomaps' water schema. */
function addRegionalCoastlineLayer(
  styleLayers: LayerSpecification[],
  flavor: Flavor,
): LayerSpecification[] {
  const coastline: LayerSpecification = {
    id: 'water_coastline',
    type: 'line',
    source: BASEMAP_SOURCE_ID,
    'source-layer': 'water',
    filter: ['==', 'kind', 'coastline'],
    minzoom: 6,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': flavor.water, 'line-width': 0.75 },
  }
  const waterRiverIndex = styleLayers.findIndex(layer => layer.id === 'water_river')
  if (waterRiverIndex === -1) return [...styleLayers, coastline]
  return [
    ...styleLayers.slice(0, waterRiverIndex + 1),
    coastline,
    ...styleLayers.slice(waterRiverIndex + 1),
  ]
}

function groupedLayers(styleLayers: LayerSpecification[]): LayerGroups {
  const groups: LayerGroups = {
    roads: [],
    buildings: [],
    landuse: [],
    pois: [],
    boundaries: [],
    places: [],
    water: [],
  }
  for (const layer of styleLayers) {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    if (layer.id === 'pois-point') groups.pois.push(layer.id)
    if (layer.id === 'pois-label') groups.pois.push(layer.id)
    if (sourceLayer === 'roads') groups.roads.push(layer.id)
    if (sourceLayer === 'buildings' && !isTextSymbol(layer))
      groups.buildings.push(layer.id)
    if (sourceLayer === 'landuse' && !isTextSymbol(layer)) groups.landuse.push(layer.id)
    if (sourceLayer === 'boundaries') groups.boundaries.push(layer.id)
    if ((sourceLayer === 'places' || sourceLayer === 'earth') && isTextSymbol(layer))
      groups.places.push(layer.id)
    if (sourceLayer === 'water' && isTextSymbol(layer)) groups.water.push(layer.id)
  }
  return groups
}

function flavorFor(theme: Theme): Flavor {
  const flavor = mapStyleFlavor(theme)
  // Protomaps embeds its regular font in formatted label expressions, where a
  // layer-level text-font override does not apply. Use the font available at
  // GLYPH_URL while creating the layers so those embedded overrides match too.
  return {
    ...flavor,
    regular: CJK_FONT_NAME,
    bold: CJK_FONT_NAME,
    italic: CJK_FONT_NAME,
  }
}

/** The exact earth colour used by the active Protomaps theme. */
export function earthColor(theme: Theme): string {
  return flavorFor(theme).earth
}

/** The exact water colour used by the active Protomaps theme. */
export function waterColor(theme: Theme): string {
  return flavorFor(theme).water
}

export function createStyle(
  tilejsonUrl: string,
  glyphs = GLYPH_URL,
  theme: Theme = 'light',
): { style: StyleSpecification; groups: LayerGroups } {
  const flavor = flavorFor(theme)
  const baseLayers = layers(BASEMAP_SOURCE_ID, flavor, { lang: 'name' })
  const styleLayers = addRegionalCoastlineLayer(
    moveRoadDirectionArrowsBelowLabels(copyPoiLayers(baseLayers)),
    flavor,
  )
  for (const layer of styleLayers) {
    if (isTextSymbol(layer)) {
      const layout = layer.layout
      if (layout) layout['text-font'] = CJK_FONT
      if (theme === 'midnight') {
        layer.paint = {
          ...layer.paint,
          'text-color': MIDNIGHT_LABEL_COLOR,
          'text-halo-color': MIDNIGHT_LABEL_HALO,
          'text-halo-width': 1.5,
          'text-halo-blur': 0,
        }
      }
    }
  }
  return {
    style: {
      version: 8,
      glyphs,
      sprite: `${SPRITE_BASE_URL}/${theme === 'midnight' ? 'dark' : theme}`,
      sources: {
        [BASEMAP_SOURCE_ID]: {
          type: 'vector',
          url: tilejsonUrl,
          attribution: BASEMAP_ATTRIBUTION,
        },
      },
      layers: styleLayers,
    },
    groups: groupedLayers(styleLayers),
  }
}

function postcardFlavor(palette: PostcardPalette, illuminated: boolean): Flavor {
  return {
    ...LIGHT,
    // Keep the sea calm and slightly darker than the paper-toned land so the
    // regional coastline remains legible without becoming conventional map blue.
    background: '#D7E6E4',
    earth: '#F6ECD8',
    park_a: '#CEDAB9',
    park_b: '#C0D0A7',
    hospital: '#F2E5CE',
    industrial: '#EDE0C7',
    school: '#F1E4CC',
    wood_a: '#B7C99E',
    wood_b: '#A6BB8C',
    scrub_a: '#DDD5A8',
    scrub_b: '#D1C898',
    glacier: '#F6ECD8',
    sand: '#F5EAD3',
    beach: '#F7EEDC',
    aerodrome: '#EFE2CA',
    runway: '#F3E8D2',
    water: '#D7E6E4',
    zoo: '#EEE1C8',
    military: '#EDE0C7',
    major_casing_late: '#F6ECD8',
    highway_casing_late: '#F6ECD8',
    major_casing_early: '#F6ECD8',
    highway_casing_early: '#F6ECD8',
    major: illuminated ? palette.accent : palette.road,
    highway: illuminated ? palette.accent : palette.road,
    bridges_major_casing: '#F6ECD8',
    bridges_highway_casing: '#F6ECD8',
    bridges_major: illuminated ? palette.accent : palette.road,
    bridges_highway: illuminated ? palette.accent : palette.road,
    boundaries: palette.coast,
    landcover: {
      grassland: '#CEDAB9',
      barren: '#E9D39F',
      urban_area: '#F1E4CC',
      farmland: '#DFC17B',
      glacier: '#F6ECD8',
      scrub: '#DDD5A8',
      forest: '#B7C99E',
    },
  }
}

function isPostcardLayer(layer: LayerSpecification): boolean {
  return POSTCARD_LAYER_IDS.has(layer.id) || layer.id.startsWith('landuse_')
}

/**
 * A deliberately sparse style used only to render regional postcard artefacts.
 * It keeps regional land, water, road, and boundary geometry while omitting
 * labels and local detail so the regional form carries the image.
 */
export function createPostcardStyle(
  tilejsonUrl: string,
  regionCode: string | null | undefined,
  glyphs = GLYPH_URL,
  illuminated = false,
): { style: StyleSpecification; groups: LayerGroups } {
  const palette = postcardPalette(regionCode)
  const flavor = postcardFlavor(palette, illuminated)
  const styleLayers = addRegionalCoastlineLayer(
    layers(BASEMAP_SOURCE_ID, flavor, { lang: 'name' }).filter(isPostcardLayer),
    flavor,
  )
  for (const layer of styleLayers) {
    if (layer.id === 'water_coastline') {
      layer.paint = {
        'line-color': palette.coast,
        'line-opacity': 0.72,
        'line-width': 0.7,
      }
    }
  }
  softenMacaoRoads(styleLayers, regionCode)
  return {
    style: {
      version: 8,
      glyphs,
      sources: {
        [BASEMAP_SOURCE_ID]: {
          type: 'vector',
          url: tilejsonUrl,
          attribution: BASEMAP_ATTRIBUTION,
        },
      },
      layers: styleLayers,
    },
    groups: groupedLayers(styleLayers),
  }
}

function softenMacaoRoads(
  styleLayers: LayerSpecification[],
  regionCode: string | null | undefined,
): void {
  if (regionCode !== 'mo') return
  for (const layer of styleLayers) {
    if (layer.type !== 'line' || !layer.id.startsWith('roads_')) continue
    const line = layer as LineLayerSpecification
    const width = line.paint?.['line-width']
    if (!width) continue
    line.paint = {
      ...line.paint,
      'line-opacity': 0.68,
      'line-width': scaleLineWidth(width),
    }
  }
}

function scaleLineWidth(
  width: NonNullable<NonNullable<LineLayerSpecification['paint']>['line-width']>,
): NonNullable<NonNullable<LineLayerSpecification['paint']>['line-width']> {
  if (typeof width === 'number') return width * 0.62
  // MapLibre only permits `zoom` as the input of a top-level interpolate or
  // step expression. Scale the output stops rather than wrapping the curve in
  // a multiplication expression, which would invalidate the style.
  if (Array.isArray(width) && width[0] === 'interpolate') {
    return width.map((value, index) =>
      index >= 4 && index % 2 === 0 && typeof value === 'number' ? value * 0.62 : value,
    ) as ExpressionSpecification
  }
  return width
}

export function applyVisibility(
  setVisibility: (layerId: string, visibility: 'visible' | 'none') => void,
  groups: LayerGroups,
  state: VisibilityState,
): void {
  const visible = (value: boolean): 'visible' | 'none' => (value ? 'visible' : 'none')
  for (const layerId of groups.roads)
    setVisibility(layerId, visible(state.features.roads))
  for (const layerId of groups.buildings)
    setVisibility(layerId, visible(state.features.buildings))
  for (const layerId of groups.landuse)
    setVisibility(layerId, visible(state.features.landuse))
  for (const layerId of groups.boundaries)
    setVisibility(layerId, visible(state.features.boundaries))
  for (const layerId of groups.pois)
    setVisibility(layerId, visible(state.features.pois))
  for (const layerId of groups.places)
    setVisibility(layerId, visible(state.labels.places))
  for (const layerId of groups.water)
    setVisibility(layerId, visible(state.labels.water))
  for (const layerId of groups.roads) {
    if (layerId.startsWith('roads_labels') || layerId === 'roads_shields') {
      setVisibility(layerId, visible(state.features.roads && state.labels.roads))
    }
  }
  if (groups.pois.includes('pois-label'))
    setVisibility('pois-label', visible(state.features.pois && state.labels.pois))
}

export function applyLocale(
  setTextField: (layerId: string, expression: ExpressionSpecification) => void,
  groups: LayerGroups,
  locale: Locale,
): void {
  const expression = labelExpression(locale)
  for (const layerId of [...groups.places, ...groups.water])
    setTextField(layerId, expression)
  for (const layerId of groups.roads) {
    if (layerId.startsWith('roads_labels')) setTextField(layerId, expression)
  }
  if (groups.pois.includes('pois-label')) setTextField('pois-label', expression)
}
