import { mount, createContext } from 'svelte'
import { writable, type Readable, type Writable } from 'svelte/store'
import App from '../../App.svelte'
import { defaultDiagnostics, type ViewerDiagnostics } from '../../diagnostics'
import type { Region } from '../catalogue'
import type { DiffLabelChange, DiffStatus, DiffSummary } from '../diff'
import { DEFAULT_VISIBILITY, type AppState } from '../types'

export const [getAppState, setAppState] = createContext<Readable<AppState>>()

export function defaultState(): AppState {
  return {
    regionCode: null,
    version: 'latest',
    comparisonVersion: null,
    comparisonMode: 'split',
    diffVisibility: { added: true, removed: true },
    theme: 'dark',
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
  onComparisonMode: (mode: AppState['comparisonMode']) => void
  onDiffVisibility: (status: DiffStatus, enabled: boolean) => void
  onDiffLabel: (change: DiffLabelChange) => void
  onTheme: (theme: AppState['theme']) => void
  onLocale: (locale: AppState['locale']) => void
  onFeature: (key: keyof AppState['features'], enabled: boolean) => void
  onLabel: (key: keyof AppState['labels'], enabled: boolean) => void
  onFit: () => void
  onDiagnostics: (open: boolean) => void
  onInspect: (enabled: boolean) => void
  onDebug: (key: 'tiles' | 'collisions' | 'overdraw', enabled: boolean) => void
  onCopyReport: () => void
  onDismissNotice: () => void
}

export interface ViewerUiState {
  catalogueReady: boolean
  enabled: boolean
  notice: string | null
  noticeId: number
  regions: Region[]
  versions: string[]
  diffSummary: DiffSummary | null
  diagnostics: ViewerDiagnostics
}

const initialUiState: ViewerUiState = {
  catalogueReady: false,
  enabled: false,
  notice: null,
  noticeId: 0,
  regions: [],
  versions: [],
  diffSummary: null,
  diagnostics: defaultDiagnostics(),
}

export class AppContext {
  private noticeId = 0
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

  setDiffSummary(diffSummary: DiffSummary | null): void {
    this.update({ diffSummary })
  }

  setState(state: AppState): void {
    this.state.set(state)
  }

  setEnabled(enabled: boolean): void {
    this.update({ enabled })
  }

  setCatalogueReady(catalogueReady: boolean): void {
    this.update({ catalogueReady })
  }

  setNotice(notice: string | null): void {
    this.update({ notice, noticeId: this.noticeId++ })
  }

  setDiagnostics(diagnostics: ViewerDiagnostics): void {
    this.update({ diagnostics })
  }

  private update(change: Partial<ViewerUiState>): void {
    this.ui.update(current => ({ ...current, ...change }))
  }
}
