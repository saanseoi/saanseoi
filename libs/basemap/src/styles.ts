import { DARK, layers, namedFlavor, type Flavor } from '@protomaps/basemaps'

export const mapStyleDefinitions = [
  {
    id: 'light',
    version: '1.0.0',
    name: 'Light',
    appearance: 'light',
    purpose: 'general',
    provenance: 'protomaps',
  },
  {
    id: 'dark',
    version: '1.0.0',
    name: 'Dark',
    appearance: 'dark',
    purpose: 'general',
    provenance: 'protomaps',
  },
  {
    id: 'white',
    version: '1.0.0',
    name: 'White',
    appearance: 'light',
    purpose: 'data-visualisation',
    provenance: 'protomaps',
  },
  {
    id: 'grayscale',
    version: '1.0.0',
    name: 'Grayscale',
    appearance: 'light',
    purpose: 'data-visualisation',
    provenance: 'protomaps',
  },
  {
    id: 'black',
    version: '1.0.0',
    name: 'Black',
    appearance: 'dark',
    purpose: 'data-visualisation',
    provenance: 'protomaps',
  },
  {
    id: 'midnight',
    version: '1.0.0',
    name: 'Midnight',
    appearance: 'dark',
    purpose: 'narrative',
    provenance: 'saanseoi',
  },
] as const

export type MapStyleDefinition = (typeof mapStyleDefinitions)[number]
export type MapStyleId = MapStyleDefinition['id']

export const mapStyleIds = mapStyleDefinitions.map(
  style => style.id,
) as readonly MapStyleId[]
export const selectableMapStyleIds = [
  'light',
  'dark',
  'midnight',
] as const satisfies readonly MapStyleId[]

export function mapStyleDefinition(style: MapStyleId): MapStyleDefinition {
  const definition = mapStyleDefinitions.find(candidate => candidate.id === style)
  if (!definition) throw new Error(`Unknown map style: ${style}`)
  return definition
}

const MIDNIGHT_FLAVOR: Flavor = {
  ...DARK,
  background: '#020617',
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

export function mapStyleFlavor(style: MapStyleId): Flavor {
  return style === 'midnight' ? MIDNIGHT_FLAVOR : namedFlavor(style)
}

/**
 * Builds a source-neutral MapLibre style fragment. Add a vector source named
 * `basemap` before passing it to MapLibre; this keeps one style reusable for
 * every SaanSeoi regional release.
 */
export function createMapStyleFragment(style: MapStyleId) {
  const flavor = mapStyleFlavor(style)
  const definition = mapStyleDefinition(style)
  return {
    version: 8 as const,
    metadata: {
      'saanseoi:style': {
        id: definition.id,
        version: definition.version,
        sourceId: 'basemap',
        sourceRequired: true,
      },
    },
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${style === 'midnight' ? 'dark' : style}`,
    layers: layers('basemap', flavor, { lang: 'name' }),
  }
}
