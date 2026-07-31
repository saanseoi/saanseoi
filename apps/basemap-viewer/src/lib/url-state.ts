import {
  DEFAULT_VISIBILITY,
  FEATURE_KEYS,
  LABEL_KEYS,
  LOCALES,
  THEMES,
  type AppState,
  type CameraState,
  type FeatureKey,
  type LabelKey,
  type Theme,
} from './types'
import { defaultState } from './ctx/app'

function has<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value)
}

function parseSet<T extends string>(
  value: string | null,
  allowed: readonly T[],
  defaults: Record<T, boolean>,
): Record<T, boolean> {
  if (value === null) return { ...defaults }
  const chosen = new Set(
    value.split(',').filter((item): item is T => has(allowed, item)),
  )
  return Object.fromEntries(allowed.map(key => [key, chosen.has(key)])) as Record<
    T,
    boolean
  >
}

function parseNumber(
  value: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

function parseCamera(params: URLSearchParams): CameraState | null {
  const lng = parseNumber(params.get('lng'), -180, 180)
  const lat = parseNumber(params.get('lat'), -90, 90)
  const zoom = parseNumber(params.get('z'), 0, 24)
  const bearing = parseNumber(params.get('bearing'), -360, 360)
  const pitch = parseNumber(params.get('pitch'), 0, 85)
  return lng === null ||
    lat === null ||
    zoom === null ||
    bearing === null ||
    pitch === null
    ? null
    : { lng, lat, zoom, bearing, pitch }
}

export function readUrlState(
  search: string,
  preferredTheme: Theme = 'light',
): AppState {
  const params = new URLSearchParams(search)
  const state = defaultState()
  const region = params.get('region')
  state.regionCode = region && /^[a-z0-9-]+$/.test(region) ? region : null
  const version = params.get('version')
  state.version =
    version === 'latest' || (version !== null && /^\d{4}-\d{2}-\d{2}$/.test(version))
      ? version
      : 'latest'
  const comparison = params.get('compare')
  state.comparisonVersion =
    comparison === 'latest' ||
    (comparison !== null && /^\d{4}-\d{2}-\d{2}$/.test(comparison))
      ? comparison
      : null
  const theme = params.get('theme')
  state.theme = has(THEMES, theme) ? theme : theme === null ? preferredTheme : 'light'
  const locale = params.get('locale')
  state.locale = has(LOCALES, locale) ? locale : 'en'
  state.labelClip = params.get('labelClip') !== 'off'
  state.features = parseSet<FeatureKey>(
    params.get('features'),
    FEATURE_KEYS,
    DEFAULT_VISIBILITY.features,
  )
  state.labels = parseSet<LabelKey>(
    params.get('labels'),
    LABEL_KEYS,
    DEFAULT_VISIBILITY.labels,
  )
  state.camera = parseCamera(params)
  return state
}

function selected<T extends string>(
  values: readonly T[],
  state: Record<T, boolean>,
): string {
  return values.filter(key => state[key]).join(',')
}

function format(value: number, precision: number): string {
  return value.toFixed(precision).replace(/\.?0+$/, '')
}

export function writeUrlState(state: AppState): string {
  const params = new URLSearchParams()
  if (state.regionCode) params.set('region', state.regionCode)
  params.set('version', state.version)
  if (state.comparisonVersion) params.set('compare', state.comparisonVersion)
  params.set('theme', state.theme)
  params.set('locale', state.locale)
  if (!state.labelClip) params.set('labelClip', 'off')
  params.set('features', selected(FEATURE_KEYS, state.features))
  params.set('labels', selected(LABEL_KEYS, state.labels))
  if (state.camera) {
    params.set('lng', format(state.camera.lng, 5))
    params.set('lat', format(state.camera.lat, 5))
    params.set('z', format(state.camera.zoom, 2))
    params.set('bearing', format(state.camera.bearing, 2))
    params.set('pitch', format(state.camera.pitch, 2))
  }
  return `?${params.toString()}`
}
