import type {
  AppState,
  CameraState,
  ComparisonMode,
  FeatureKey,
  LabelKey,
  Locale,
  Theme,
} from './types'

export type ViewerAction =
  | { type: 'setRegion'; regionCode: string }
  | { type: 'setVersion'; version: string }
  | { type: 'setComparisonVersion'; version: string | null }
  | { type: 'setComparisonMode'; mode: ComparisonMode }
  | { type: 'setDiffVisibility'; status: 'added' | 'removed'; enabled: boolean }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setLocale'; locale: Locale }
  | { type: 'setFeature'; key: FeatureKey; enabled: boolean }
  | { type: 'setLabel'; key: LabelKey; enabled: boolean }
  | { type: 'setDiagnosticsOpen'; open: boolean }
  | { type: 'setCamera'; camera: CameraState | null }
  | {
      type: 'setReleaseSelection'
      version: string
      comparisonVersion: string | null
    }

export function reduceViewerState(state: AppState, action: ViewerAction): AppState {
  switch (action.type) {
    case 'setRegion':
      return { ...state, regionCode: action.regionCode }
    case 'setVersion':
      return { ...state, version: action.version }
    case 'setComparisonVersion':
      return { ...state, comparisonVersion: action.version }
    case 'setComparisonMode':
      return { ...state, comparisonMode: action.mode }
    case 'setDiffVisibility':
      return {
        ...state,
        diffVisibility: { ...state.diffVisibility, [action.status]: action.enabled },
      }
    case 'setTheme':
      return { ...state, theme: action.theme }
    case 'setLocale':
      return { ...state, locale: action.locale }
    case 'setFeature':
      return { ...state, features: { ...state.features, [action.key]: action.enabled } }
    case 'setLabel':
      return { ...state, labels: { ...state.labels, [action.key]: action.enabled } }
    case 'setDiagnosticsOpen':
      return { ...state, diagnosticsOpen: action.open }
    case 'setCamera':
      return { ...state, camera: action.camera ? { ...action.camera } : null }
    case 'setReleaseSelection':
      return {
        ...state,
        version: action.version,
        comparisonVersion: action.comparisonVersion,
      }
  }
}
