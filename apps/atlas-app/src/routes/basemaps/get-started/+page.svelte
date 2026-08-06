<script lang="ts">
import { Basemap, Main } from '$lib/bits'
import { getCurrentLocale, m, type MessageKey } from '$lib/bits/internal/i18n'

let locale = $derived(getCurrentLocale())
const t = (key: MessageKey) => {
  locale
  return m[key]()
}
</script>

<svelte:head>
  <title>{t('tiles_getting_started_title')} | Saanseoi</title>
  <meta name="description" content={t('tiles_getting_started_meta_description')}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <Basemap.Hero />
  <Basemap.Prerequisites />
  <Basemap.TokenExchange />
  <Basemap.Integrations />
  <Basemap.Credentials />
</Main>
