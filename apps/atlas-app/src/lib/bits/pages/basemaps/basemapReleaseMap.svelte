<script lang="ts">
import { onMount } from 'svelte'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import type { BasemapManifest } from '#lib/registry/basemapRelease.js'
let { manifest }: { manifest: BasemapManifest } = $props()
let container: HTMLElement
let fullscreenContainer: HTMLElement
let loadError = $state(false)
let loading = $state(true)
onMount(() => {
  let disposed = false
  let map: MapLibreMap | undefined
  let observer: ResizeObserver | undefined
  let restoreFullscreen: (() => void) | undefined
  const exitOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      fullscreenContainer
        .querySelector<HTMLButtonElement>('.maplibregl-ctrl-shrink')
        ?.click()
    }
  }
  void (async () => {
    try {
      const [
        maplibre,
        { default: workerUrl },
        { createMapStyleFragment, BASEMAP_ATTRIBUTION },
      ] = await Promise.all([
        import('maplibre-gl'),
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
        import('@repo/basemap'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
      if (disposed) return
      maplibre.setWorkerUrl(workerUrl)
      const region = manifest.region.code
      const name = (
        { hk: 'hongkong', mo: 'macau', gba: 'gba' } as Record<string, string>
      )[region]
      const tilejson = new URL(
        `https://tiles.saanseoi.hk/${name}-${manifest.release.version}.json`,
      )
      const style = {
        ...createMapStyleFragment('midnight'),
        sources: {
          basemap: {
            type: 'vector',
            url: tilejson.href,
            attribution: BASEMAP_ATTRIBUTION,
          },
        },
      } as StyleSpecification
      map = new maplibre.Map({
        container,
        style,
        center:
          region === 'mo'
            ? [113.56, 22.16]
            : region === 'gba'
              ? [113.3, 22.8]
              : [114.15, 22.35],
        zoom: region === 'mo' ? 13 : region === 'gba' ? 9.5 : 11.5,
        cooperativeGestures: true,
        transformRequest: url => {
          const request = new URL(url)
          if (import.meta.env.DEV && request.origin === 'https://tiles.saanseoi.hk') {
            return {
              url: new URL(
                `/__basemap${request.pathname}${request.search}`,
                window.location.origin,
              ).href,
            }
          }
          return { url }
        },
      })
      map.addControl(new maplibre.NavigationControl(), 'top-right')
      const fullscreen = new maplibre.FullscreenControl({
        container: fullscreenContainer,
        pseudo: true,
      })
      fullscreen.on('fullscreenstart', () => {
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        document.addEventListener('keydown', exitOnEscape)
        restoreFullscreen = () => {
          document.body.style.overflow = overflow
          document.removeEventListener('keydown', exitOnEscape)
          restoreFullscreen = undefined
        }
      })
      fullscreen.on('fullscreenend', () => restoreFullscreen?.())
      map.addControl(fullscreen, 'top-right')
      map.once('idle', () => {
        loading = false
      })
      map.on('error', event => {
        if ('sourceId' in event && event.sourceId === 'basemap') {
          loadError = true
          loading = false
        }
      })
      observer = new ResizeObserver(() => map?.resize())
      observer.observe(container)
    } catch {
      if (!disposed) {
        loadError = true
        loading = false
      }
    }
  })()
  return () => {
    disposed = true
    restoreFullscreen?.()
    observer?.disconnect()
    map?.remove()
  }
})
</script>
<div
  bind:this={fullscreenContainer}
  class="relative h-[70vh] min-h-120 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low [&.maplibregl-pseudo-fullscreen]:min-h-0 [&.maplibregl-pseudo-fullscreen]:rounded-none"
>
  <section
    bind:this={container}
    class="h-full w-full"
    aria-label={`Map of ${manifest.region.description}, ${manifest.release.version}`}
  ></section>
  {#if loading || loadError}
    <p
      class="absolute left-4 top-4 max-w-72 rounded-md border border-outline-variant bg-surface-container px-4 py-3 font-body text-label-md text-primary"
      role="status"
    >
      {loadError
        ? 'The map could not be loaded. Please reload to try again.'
        : 'Loading map…'}
    </p>
  {/if}
</div>
