export const LOCALES = ['en', 'zh-Hant', 'zh-Hans'] as const
export type Locale = (typeof LOCALES)[number]

export const THEMES = ['light', 'dark', 'midnight'] as const
export type Theme = (typeof THEMES)[number]

export const COMPARISON_MODES = ['split', 'overlay', 'side-by-side', 'labels'] as const
export type ComparisonMode = (typeof COMPARISON_MODES)[number]

export const FEATURE_KEYS = [
  'roads',
  'buildings',
  'landuse',
  'pois',
  'boundaries',
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
export const LABEL_KEYS = ['places', 'roads', 'pois', 'water'] as const
export type LabelKey = (typeof LABEL_KEYS)[number]

export interface VisibilityState {
  features: Record<FeatureKey, boolean>
  labels: Record<LabelKey, boolean>
}

export interface AppState extends VisibilityState {
  regionCode: string | null
  version: string
  comparisonVersion: string | null
  comparisonMode: ComparisonMode
  diffVisibility: { added: boolean; removed: boolean }
  theme: Theme
  locale: Locale
  diagnosticsOpen: boolean
  camera: CameraState | null
}

export interface CameraState {
  lng: number
  lat: number
  zoom: number
  bearing: number
  pitch: number
}

export const DEFAULT_VISIBILITY: VisibilityState = {
  features: {
    roads: true,
    buildings: true,
    landuse: true,
    pois: true,
    boundaries: true,
  },
  labels: { places: true, roads: true, pois: false, water: true },
}
