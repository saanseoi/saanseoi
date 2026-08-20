<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import {
  PageDescription,
  PageHeader,
  PageSection,
  PageTitle,
} from '#lib/bits/pages/shared/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { mapStyleDefinitions, type MapStyleDefinition } from '@repo/basemap'

const regions = [
  {
    code: 'hk',
    name: 'Hong Kong',
    tileset: 'hongkong',
    landmarks: { 16: 'Central', 19: 'Hollywood Road' },
    camera: { lng: 114.1584, lat: 22.2855 },
  },
  {
    code: 'mo',
    name: 'Macao',
    tileset: 'macau',
    landmarks: { 16: 'Senado Square', 19: 'Grand Lisboa' },
    camera: { lng: 113.5439, lat: 22.1933 },
  },
  {
    code: 'gba',
    name: 'Greater Bay Area',
    tileset: 'gba',
    landmarks: { 16: 'Canton Tower', 19: 'Beijing Road' },
    camera: { lng: 113.3247, lat: 23.1065 },
  },
] as const

type AppearanceFilter = 'all' | 'light' | 'dark'
type PurposeFilter = 'all' | MapStyleDefinition['purpose']
const appearanceOptions = ['all', 'light', 'dark'] as const
const purposeOptions = ['all', 'general', 'data-visualisation', 'narrative'] as const

let regionCode = $state<(typeof regions)[number]['code']>('hk')
let appearance = $state<AppearanceFilter>('all')
let purpose = $state<PurposeFilter>('all')

const selectedRegion = $derived(
  regions.find(region => region.code === regionCode) ?? regions[0],
)
const visibleStyles = $derived(
  mapStyleDefinitions.filter(
    style =>
      (appearance === 'all' || style.appearance === appearance) &&
      (purpose === 'all' || style.purpose === purpose),
  ),
)

function previewUrl(style: MapStyleDefinition, zoom: 16 | 19) {
  const landmark = selectedRegion.landmarks[zoom].toLowerCase().replaceAll(' ', '-')
  return `https://tiles.saanseoi.hk/render/${selectedRegion.code}/${selectedRegion.tileset}-latest-${style.id}-${landmark}-z${zoom}.webp`
}

function viewerUrl(style: MapStyleDefinition) {
  const url = new URL('https://viewer.saanseoi.hk/')
  url.searchParams.set('region', selectedRegion.code)
  url.searchParams.set('version', 'latest')
  url.searchParams.set('theme', style.id)
  url.searchParams.set('lng', String(selectedRegion.camera.lng))
  url.searchParams.set('lat', String(selectedRegion.camera.lat))
  url.searchParams.set('z', '16')
  url.searchParams.set('bearing', '0')
  url.searchParams.set('pitch', '0')
  return url.toString()
}

const styleUrl = (style: MapStyleDefinition) =>
  `https://api.saanseoi.hk/v0/styles/${style.id}/${style.version}.json`

function appearanceLabel(option: AppearanceFilter) {
  if (option === 'all') return m.themes_all()
  return option === 'light' ? m.themes_light() : m.themes_dark()
}

function purposeLabel(option: PurposeFilter) {
  if (option === 'all') return m.themes_all()
  if (option === 'general') return m.themes_general()
  if (option === 'narrative') return m.themes_narrative()
  return m.themes_data_visualisation()
}
</script>

<Seo title={m.themes_title()} description={m.themes_meta_description()} />

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <PageHeader class="max-w-6xl">
    <div class="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
      <div class="max-w-3xl">
        <p
          class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
        >
          {m.themes_eyebrow()}
        </p>
        <PageTitle class="mt-3">{m.themes_hero()}</PageTitle>
        <PageDescription class="mt-5">{m.themes_description()}</PageDescription>
      </div>
      <label
        class="grid min-w-56 gap-2 font-body text-label-md font-semibold text-foreground"
      >
        {m.themes_region()}
        <select
          aria-label={m.themes_region()}
          bind:value={regionCode}
          onchange={() => trackClientProductUsage({ event: 'client.basemap_control', surface: 'basemaps', entityType: 'region', entityId: regionCode })}
          class="min-h-11 rounded-default border border-border-card bg-background px-3 font-body text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          {#each regions as region}
            <option value={region.code}>{region.name}</option>
          {/each}
        </select>
      </label>
    </div>
  </PageHeader>

  <PageSection>
    <div
      class="grid gap-6 rounded-xl border border-border-card bg-surface-container-low p-6 md:grid-cols-2"
    >
      <div>
        <h2 class="font-display text-xl font-bold text-primary">
          {m.themes_what_is_heading()}
        </h2>
        <p class="mt-3 font-body leading-7 text-foreground-alt">
          {m.themes_what_is_body()}
        </p>
      </div>
      <div>
        <h2 class="font-display text-xl font-bold text-primary">
          {m.themes_protomaps_heading()}
        </h2>
        <p class="mt-3 font-body leading-7 text-foreground-alt">
          {m.themes_protomaps_body()}
          <a
            class="font-semibold text-secondary underline decoration-secondary/45 underline-offset-4 hover:text-primary"
            href="https://docs.protomaps.com/basemaps/maplibre#creating-styles-programatically"
            target="_blank"
            rel="noreferrer"
            >{m.themes_protomaps_link()}</a
          >.
        </p>
      </div>
    </div>
  </PageSection>

  <PageSection>
    <div
      class="flex flex-col gap-5 border-y border-border-card py-5 lg:flex-row lg:items-end lg:justify-between"
    >
      <fieldset>
        <legend class="font-body text-label-sm font-semibold text-foreground-alt">
          {m.themes_appearance()}
        </legend>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each appearanceOptions as option}
            <button
              type="button"
              aria-pressed={appearance === option}
              class="rounded-full border px-3 py-1.5 font-body text-sm font-semibold transition-colors {appearance === option ? 'border-primary bg-primary text-on-primary' : 'border-border-card bg-background text-foreground hover:bg-muted'}"
              onclick={() => {
                appearance = option as AppearanceFilter
                trackClientProductUsage({ event: 'client.basemap_control', surface: 'basemaps', entityType: 'theme', entityId: appearance })
              }}
            >
              {appearanceLabel(option)}
            </button>
          {/each}
        </div>
      </fieldset>
      <fieldset>
        <legend class="font-body text-label-sm font-semibold text-foreground-alt">
          {m.themes_purpose()}
        </legend>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each purposeOptions as option}
            <button
              type="button"
              aria-pressed={purpose === option}
              class="rounded-full border px-3 py-1.5 font-body text-sm font-semibold transition-col {purpose === option ? 'border-primary bg-primary text-on-primary' : 'border-border-card bg-background text-foreground hover:bg-muted'}"
              onclick={() => {
                purpose = option as PurposeFilter
                trackClientProductUsage({ event: 'client.basemap_control', surface: 'basemaps', entityType: 'theme', entityId: purpose })
              }}
            >
              {purposeLabel(option)}
            </button>
          {/each}
        </div>
      </fieldset>
    </div>

    <div class="mt-8 grid gap-8 lg:grid-cols-2">
      {#each visibleStyles as style}
        <article
          class="overflow-hidden rounded-xl border border-border-card bg-background shadow-sm"
        >
          <div class="grid grid-cols-2 border-b border-border-card">
            {#each [16, 19] as zoom}
              <figure
                class="relative aspect-square overflow-hidden bg-muted not-last:border-r not-last:border-border-card"
              >
                <img
                  class="size-full object-cover"
                  src={previewUrl(style, zoom as 16 | 19)}
                  alt={`${style.name}, ${selectedRegion.landmarks[zoom as 16 | 19]}, zoom ${zoom}`}
                  loading="lazy"
                >
                <figcaption
                  class="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-1 font-mono text-xs font-semibold text-white"
                >
                  z{zoom}
                </figcaption>
              </figure>
            {/each}
          </div>
          <div class="p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="font-display text-2xl font-bold text-primary">
                  {style.name}
                </h2>
                <p class="mt-1 font-body text-sm text-foreground-alt">
                  {style.provenance === 'protomaps' ? m.themes_official_protomaps() : m.themes_saanseoi_creation()}
                  ·
                  {style.purpose === 'data-visualisation' ? m.themes_data_visualisation() : style.purpose === 'general' ? m.themes_general() : m.themes_narrative()}
                </p>
              </div>
              <span
                class="rounded-full bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground-alt"
                >{style.appearance}</span
              >
            </div>
            <p class="mt-4 font-body text-sm leading-6 text-foreground-alt">
              {m.themes_preview_landmark()}
            </p>
            <div class="mt-5 flex flex-wrap gap-3">
              <Button
                href={viewerUrl(style)}
                target="_blank"
                rel="noreferrer"
                onclick={() => trackClientProductUsage({ event: 'client.viewer_link', surface: 'basemaps', entityType: 'theme', entityId: style.id })}
                size="compact"
                >{m.themes_preview_map()}</Button
              >
              <Button
                href={styleUrl(style)}
                target="_blank"
                rel="noreferrer"
                onclick={() => trackClientProductUsage({ event: 'client.style_link', surface: 'style_request', entityType: 'style', entityId: style.id })}
                size="compact"
                variant="secondary"
                >{m.themes_style_json()}</Button
              >
            </div>
          </div>
        </article>
      {/each}
    </div>
  </PageSection>
</Main>
