<script lang="ts">
import { page } from '$app/state'
import { getCurrentLocale } from '$lib/bits/internal/i18n'

import CodeBlock from './basemapCodeBlock.svelte'
import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}

const selectedRegion = $derived(page.url.searchParams.get('region'))
const selectedVersion = $derived(page.url.searchParams.get('version'))
const selectedTileset = $derived(
  selectedRegion === 'mo' ? 'macau' : selectedRegion === 'gba' ? 'gba' : 'hongkong',
)
const selectedTilejson = $derived(
  `${selectedTileset}-${selectedVersion && /^\d{4}-\d{2}-\d{2}$/.test(selectedVersion) ? selectedVersion : 'latest'}.json`,
)

const mapLibreExample = $derived(
  [
    "const { accessToken } = await fetch('/api/saanseoi-tile-token').then(response =>",
    '  response.json(),',
    ')',
    "const tileOrigin = 'https://tiles.saanseoi.hk/'",
    '',
    'const map = new maplibregl.Map({',
    "  container: 'map',",
    '  style: {',
    '    version: 8,',
    '    sources: {',
    `      saanseoi: { type: 'vector', url: tileOrigin + '${selectedTilejson}' },`,
    '    },',
    '    layers: [/* your MapLibre style layers for the saanseoi source */],',
    '  },',
    '  transformRequest: url =>',
    '    url.startsWith(tileOrigin)',
    "      ? { url, headers: { Authorization: 'Bearer ' + accessToken } }",
    '      : { url },',
    '})',
  ].join('\n'),
)

const mapboxExample = $derived(
  [
    "const { accessToken } = await fetch('/api/saanseoi-tile-token').then(response =>",
    '  response.json(),',
    ')',
    "const tileOrigin = 'https://tiles.saanseoi.hk/'",
    '',
    'const map = new mapboxgl.Map({',
    "  container: 'map',",
    "  style: 'mapbox://styles/your-account/your-style',",
    '  transformRequest: url =>',
    '    url.startsWith(tileOrigin)',
    "      ? { url, headers: { Authorization: 'Bearer ' + accessToken } }",
    '      : { url },',
    '})',
    '',
    "map.on('load', () => {",
    "  map.addSource('saanseoi', {",
    "    type: 'vector',",
    `    url: tileOrigin + '${selectedTilejson}',`,
    '  })',
    '  // Add layers that use the `saanseoi` source and its source layers.',
    '})',
  ].join('\n'),
)

const otherLibraryExample = [
  "const { accessToken } = await fetch('/api/saanseoi-tile-token').then(response =>",
  '  response.json(),',
  ')',
  '',
  "// Use this in your library's tile-load or request hook.",
  'async function fetchSaanSeoiTile(url: string) {',
  '  return fetch(url, {',
  "    headers: { Authorization: 'Bearer ' + accessToken },",
  '  })',
  '}',
].join('\n')
</script>

<section class="mt-16 border-t border-border-card pt-10 md:mt-24 md:pt-14">
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {t('tiles_getting_started_add_basemap')}
  </p>
  <h2 class="mt-3 max-w-3xl font-display text-headline-md font-bold text-primary">
    {t('tiles_getting_started_add_basemap_heading')}
  </h2>
  <p class="mt-5 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    <code class="font-mono text-sm text-foreground"
      >https://tiles.saanseoi.hk/{selectedTilejson}</code
    >
    {t('tiles_getting_started_add_basemap_intro_after_endpoint')}
  </p>

  <div class="mt-8 grid gap-8 xl:grid-cols-3">
    <article class="min-w-0">
      <h3 class="font-display text-headline-sm font-bold text-primary">MapLibre</h3>
      <p class="mt-3 min-h-20 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_maplibre_description_before_hook')}
        <code class="font-mono text-sm text-foreground">transformRequest</code>
        {t('tiles_getting_started_maplibre_description_after_hook')}
      </p>
      <div class="mt-5">
        <CodeBlock
          code={mapLibreExample}
          label={t('tiles_getting_started_maplibre_label')}
        />
      </div>
    </article>
    <article class="min-w-0">
      <h3 class="font-display text-headline-sm font-bold text-primary">Mapbox GL JS</h3>
      <p class="mt-3 min-h-20 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_mapbox_description')}
      </p>
      <div class="mt-5">
        <CodeBlock
          code={mapboxExample}
          label={t('tiles_getting_started_mapbox_label')}
        />
      </div>
    </article>
    <article class="min-w-0">
      <h3 class="font-display text-headline-sm font-bold text-primary">
        {t('tiles_getting_started_other_libraries_title')}
      </h3>
      <p class="mt-3 min-h-20 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_other_libraries_description')}
      </p>
      <div class="mt-5">
        <CodeBlock
          code={otherLibraryExample}
          label={t('tiles_getting_started_request_hook')}
        />
      </div>
    </article>
  </div>
</section>
