<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import * as Header from '../components/index.js'
import type { BasemapManifest } from '#lib/registry/basemapRelease.js'
import type { RegistryAccessMetrics } from '#lib/registry/accessMetrics.js'
let {
  manifest,
  manifestUrl,
  viewerUrl,
  previewImage,
  current,
  accessMetrics,
}: {
  manifest: BasemapManifest
  manifestUrl: string
  viewerUrl: string
  previewImage: string
  current: boolean
  accessMetrics: RegistryAccessMetrics | null
} = $props()
let metrics = $derived([
  {
    label: 'API requests',
    value: accessMetrics
      ? (accessMetrics.metrics.apiRequests ?? 0).toLocaleString('en-GB')
      : 'N/A',
  },
  {
    label: 'Downloads',
    value: accessMetrics
      ? (accessMetrics.metrics.downloads ?? 0).toLocaleString('en-GB')
      : 'N/A',
  },
])
</script>
<Header.Root backgroundImage={previewImage} softBackground>
  <Header.Header
    label="Basemap release"
    statusLabel={current ? 'Current' : 'Superseded'}
    statusClass="border-secondary/30 bg-surface-container/50 text-secondary"
    statusDotClass="bg-secondary"
    {metrics}
    showBackground
  >
    {#snippet statusAction()}
      <a
        class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 font-body text-label-sm font-semibold text-secondary transition hover:bg-secondary/10 focus-visible:outline-2 focus-visible:outline-secondary"
        href={viewerUrl}
        target="_blank"
        rel="noreferrer"
      >
        Preview map <Icon icon="ion:open-outline" class="size-4" aria-hidden="true" />
      </a>
    {/snippet}
  </Header.Header>
  <Header.Content {metrics} showBackground>
    {#snippet main()}
      <Header.Main
        title="Basemap"
        region={manifest.region.description}
        details={[
          {
            label: 'Version',
            value: manifest.release.version,
            href: manifestUrl,
            isExternal: true,
          },
          {
            label: 'Schema',
            value: manifest.release.schema?.version ?? 'Not recorded',
          },
          {
            label: 'Built at',
            value: (manifest.provenance?.builtAt ?? manifest.createdAt)
              .replace('T', ' ')
              .replace(/\.\d+Z$/, ' UTC'),
          },
          { label: 'Archive', value: manifest.release.archive.tileset },
          {
            label: 'Base schema',
            value: manifest.release.schema?.base ?? 'Not recorded',
          },
          {
            label: 'Archive size',
            value:
              manifest.release.archive.size === undefined
                ? 'Not supplied'
                : `${(manifest.release.archive.size / 1_000_000).toFixed(2)} MB`,
          },
        ]}
      >
        {#snippet description()}
          <p
            class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
          >
            Streets and paths, buildings, places and points of interest, railways, land
            use and water, drawn from OpenStreetMap and Natural Earth. Regional
            boundaries and detailed coastlines complete the map of
            {manifest.region.description}.
          </p>
        {/snippet}
      </Header.Main>
    {/snippet}
  </Header.Content>
</Header.Root>
