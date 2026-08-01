import { DARK, layers, namedFlavor, type Flavor } from '@protomaps/basemaps'
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import type { FeatureKey, LabelKey, Locale, Theme, VisibilityState } from './types'
import { BASEMAP_ATTRIBUTION } from '@repo/basemap'

export const BASEMAP_SOURCE_ID = 'basemap'
export const BASEMAP_LABEL_SOURCE_ID = 'basemap-labels'
export const GLYPH_URL =
  'https://raw.githubusercontent.com/klokantech/klokantech-gl-fonts/master/{fontstack}/{range}.pbf'
const SPRITE_BASE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4'
const CJK_FONT_NAME = 'KlokanTech Noto Sans CJK Regular'
const CJK_FONT = [CJK_FONT_NAME]
const MIDNIGHT_LABEL_COLOR = '#F8FAFC'
const MIDNIGHT_LABEL_HALO = '#020617'

const MIDNIGHT_FLAVOR: Flavor = {
  ...DARK,
  background: '#020617',
  // This must remain visibly distinct from midnight's #061426 water. At
  // regional zooms the earth layer is the only land coverage beneath the more
  // detailed land-use polygons, so near-identical colours make valid land look
  // as though it disappeared into the sea.
  earth: '#0D3036',
  park_a: '#0B2B32',
  park_b: '#12414A',
  industrial: '#1B2638',
  school: '#202B40',
  wood_a: '#0D3036',
  wood_b: '#15505A',
  pedestrian: '#243147',
  water: '#061426',
  buildings: '#48234F',
  boundaries: '#527D9B',
  tunnel_other_casing: '#07101F',
  tunnel_minor_casing: '#07101F',
  tunnel_link_casing: '#07101F',
  tunnel_major_casing: '#07101F',
  tunnel_highway_casing: '#07101F',
  tunnel_other: '#1D6E8C',
  tunnel_minor: '#1D6E8C',
  tunnel_link: '#2084A6',
  tunnel_major: '#19B7D4',
  tunnel_highway: '#5AE6F2',
  pier: '#167C9E',
  minor_service_casing: '#0A1727',
  minor_casing: '#0A1727',
  link_casing: '#0A1727',
  major_casing_late: '#0A1727',
  highway_casing_late: '#0A1727',
  other: '#176B8F',
  minor_service: '#176B8F',
  minor_a: '#2185A8',
  minor_b: '#2185A8',
  link: '#299FC1',
  major_casing_early: '#0A1727',
  major: '#24C4DE',
  highway_casing_early: '#0A1727',
  highway: '#6BEAF5',
  railway: '#9C8AF2',
  bridges_other_casing: '#0A1727',
  bridges_minor_casing: '#0A1727',
  bridges_link_casing: '#0A1727',
  bridges_major_casing: '#0A1727',
  bridges_highway_casing: '#0A1727',
  bridges_other: '#176B8F',
  bridges_minor: '#2185A8',
  bridges_link: '#299FC1',
  bridges_major: '#24C4DE',
  bridges_highway: '#6BEAF5',
  roads_label_minor: '#C9F6FC',
  roads_label_minor_halo: '#020617',
  roads_label_major: '#F8FAFC',
  roads_label_major_halo: '#020617',
  ocean_label: '#9EDCE8',
  subplace_label: '#E2E8F0',
  subplace_label_halo: '#020617',
  city_label: '#F8FAFC',
  city_label_halo: '#020617',
  state_label: '#F8FAFC',
  state_label_halo: '#020617',
  country_label: '#F8FAFC',
  address_label: '#D8F4F8',
  address_label_halo: '#020617',
  pois: {
    blue: '#7DD3FC',
    green: '#5EEAD4',
    lapis: '#A5B4FC',
    pink: '#F9A8D4',
    red: '#FDA4AF',
    slategray: '#CBD5E1',
    tangerine: '#FCD34D',
    turquoise: '#5EEAD4',
  },
}

export type LayerGroups = Record<FeatureKey | LabelKey, string[]>

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

function moveSymbolsToLabelSource(
  styleLayers: LayerSpecification[],
): LayerSpecification[] {
  return styleLayers.map(layer =>
    layer.type === 'symbol' && layer.source === BASEMAP_SOURCE_ID
      ? { ...layer, source: BASEMAP_LABEL_SOURCE_ID }
      : layer,
  )
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
  const flavor = theme === 'midnight' ? MIDNIGHT_FLAVOR : namedFlavor(theme)
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
  labelTilejsonUrl = tilejsonUrl,
): { style: StyleSpecification; groups: LayerGroups } {
  const baseLayers = layers(BASEMAP_SOURCE_ID, flavorFor(theme), { lang: 'name' })
  const styleLayers = moveRoadDirectionArrowsBelowLabels(
    moveSymbolsToLabelSource(copyPoiLayers(baseLayers)),
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
        [BASEMAP_LABEL_SOURCE_ID]: {
          type: 'vector',
          url: labelTilejsonUrl,
          attribution: BASEMAP_ATTRIBUTION,
        },
      },
      layers: styleLayers,
    },
    groups: groupedLayers(styleLayers),
  }
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
  setTextField('pois-label', expression)
}
