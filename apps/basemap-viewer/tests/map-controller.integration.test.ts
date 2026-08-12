import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeMap {
  static instances: FakeMap[] = []
  static autoLoad = true
  private readonly listeners = new Map<string, Set<(event?: any) => void>>()
  private readonly source = {
    type: 'vector' as const,
    attribution: '',
    setUrl: vi.fn(),
  }
  sourceLoaded = true
  removed = false

  constructor(_options: unknown) {
    FakeMap.instances.push(this)
    if (FakeMap.autoLoad) queueMicrotask(() => this.emit('load'))
  }

  on(event: string, listener: (value?: any) => void): this {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  once(event: string, listener: (value?: any) => void): this {
    const once = (value?: any) => {
      this.off(event, once)
      listener(value)
    }
    return this.on(event, once)
  }

  off(event: string, listener: (value?: any) => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string, value?: any): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value)
  }

  getSource(): typeof this.source {
    return this.source
  }

  isSourceLoaded(): boolean {
    return this.sourceLoaded
  }

  getContainer(): { querySelector: () => null } {
    return { querySelector: () => null }
  }

  getStyle(): { layers: never[] } {
    return { layers: [] }
  }

  addSource(): void {}
  addLayer(): void {}
  getLayer(): undefined {
    return undefined
  }
  removeLayer(): void {}
  removeSource(): void {}
  resize(): void {}
  setStyle(): void {
    queueMicrotask(() => this.emit('error', { error: new Error('style failed') }))
  }
  remove(): void {
    this.removed = true
  }
}

vi.mock('maplibre-gl', () => ({
  Map: FakeMap,
  AttributionControl: class {},
  NavigationControl: class {},
  setWorkerUrl: vi.fn(),
}))

const { MapController } = await import('../src/lib/map-controller')

describe('MapController lifecycle integration', () => {
  beforeEach(() => {
    FakeMap.instances = []
    FakeMap.autoLoad = true
    Object.assign(globalThis, { window: globalThis })
  })

  const options = () => ({
    role: 'primary' as const,
    container: 'map',
    headless: true,
    postcardRendering: false,
    getTheme: () => 'light' as const,
    getRegionCode: () => 'hk',
    createStyle: (url: string) => ({
      style: { version: 8 as const, sources: {}, layers: [], metadata: { url } },
      groups: {
        roads: [],
        buildings: [],
        landuse: [],
        pois: [],
        boundaries: [],
        places: [],
        water: [],
      },
    }),
    applyState: vi.fn(),
    installDiagnostics: vi.fn(),
    resetTileWeight: vi.fn(),
  })

  it('rejects a style replacement source error', async () => {
    const controller = new MapController(options())
    await controller.create('https://tiles.example/old.json', {
      camera: null,
      boundary: null,
    })

    await expect(
      controller.replaceStyle('https://tiles.example/new.json'),
    ).rejects.toThrow('style failed')
  })

  it('cancels a pending map load without publishing it', async () => {
    FakeMap.autoLoad = false
    const controller = new MapController(options())
    const operation = new AbortController()
    const loading = controller.create('https://tiles.example/old.json', {
      camera: null,
      boundary: null,
      signal: operation.signal,
    })
    const map = FakeMap.instances[0]
    if (!map) throw new Error('The fake map was not created.')
    operation.abort()

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  })
})
