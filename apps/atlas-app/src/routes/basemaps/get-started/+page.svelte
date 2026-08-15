<script lang="ts">
import { Basemap, Main, Seo } from '$lib/bits'
import MappingIntegration from '$lib/bits/components/mappingIntegration.svelte'
import { basemapIntegrations } from '$lib/bits/components/mappingIntegrations'
import { getCurrentLocale, m, type MessageKey } from '$lib/bits/internal/i18n'

let locale = $derived(getCurrentLocale())
const t = (key: MessageKey) => {
  locale
  return m[key]()
}
</script>

<Seo
  title={t('tiles_getting_started_title')}
  description={t('tiles_getting_started_meta_description')}
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <Basemap.Hero />
  <Basemap.Prerequisites />
  <Basemap.TokenExchange />
  <MappingIntegration
    eyebrow="Choose your library"
    heading="Add the basemap with the library you already use."
    description="Start with MapLibre, or switch to the Mapbox GL JS or Leaflet example. Each loads the same SaanSeoi vector source and style."
    integrations={basemapIntegrations}
  />
  <Basemap.Credentials />
</Main>
