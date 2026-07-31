import { mount, createContext } from 'svelte'
import { writable, type Readable, type Writable } from 'svelte/store'
import App from '../../App.svelte'
import { defaultDiagnostics, type ViewerDiagnostics } from '../../diagnostics'
import type { Region } from '../catalogue'
import { DEFAULT_VISIBILITY, type AppState } from '../types'

export const [getAppState, setAppState] = createContext<Readable<AppState>>()

export function defaultState(): AppState {
  return {
    regionCode: null,
    version: 'latest',
    comparisonVersion: null,
    theme: 'light',
    locale: 'en',
    labelClip: true,
    features: { ...DEFAULT_VISIBILITY.features },
    labels: { ...DEFAULT_VISIBILITY.labels },
    camera: null,
  }
}

export interface Callbacks {
  onRegion: (code: string) => void
  onVersion: (version: string) => void
  onComparisonVersion: (version: string | null) => void
  onTheme: (theme: AppState['theme']) => void
  onLocale: (locale: AppState['locale']) => void
  onFeature: (key: keyof AppState['features'], enabled: boolean) => void
  onLabel: (key: keyof AppState['labels'], enabled: boolean) => void
  onFit: () => void
  onDiagnostics: (open: boolean) => void
  onInspect: (enabled: boolean) => void
  onDebug: (key: 'tiles' | 'collisions' | 'overdraw', enabled: boolean) => void
  onCopyReport: () => void
}

export interface ViewerUiState {
  enabled: boolean
  notice: string | null
  regions: Region[]
  versions: string[]
  diagnostics: ViewerDiagnostics
}

const initialUiState: ViewerUiState = {
  enabled: false,
  notice: null,
  regions: [],
  versions: [],
  diagnostics: defaultDiagnostics(),
}

export class AppContext {
  private readonly state: Writable<AppState> = writable(defaultState())
  private readonly ui: Writable<ViewerUiState> = writable(initialUiState)

  constructor(container: HTMLElement, callbacks: Callbacks) {
    mount(App, {
      target: container,
      props: { callbacks, state: this.state, ui: this.ui },
    })
  }

  setRegions(regions: Region[]): void {
    this.update({ regions })
  }

  setVersions(versions: string[]): void {
    this.update({ versions })
  }

  setState(state: AppState): void {
    this.state.set(state)
  }

  setEnabled(enabled: boolean): void {
    this.update({ enabled })
  }

  setNotice(notice: string | null): void {
    this.update({ notice })
  }

  setDiagnostics(diagnostics: ViewerDiagnostics): void {
    this.update({ diagnostics })
  }

  private update(change: Partial<ViewerUiState>): void {
    this.ui.update(current => ({ ...current, ...change }))
  }
}
