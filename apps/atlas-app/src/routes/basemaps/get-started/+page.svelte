<script lang="ts">
import { Basemap } from '#lib/bits/pages/basemaps/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { getCurrentLocale, m, type MessageKey } from '#lib/bits/internal/i18n.js'

let locale = $derived(getCurrentLocale())
const t = (key: MessageKey) => {
  locale
  return (m[key] as () => string)()
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
  <Basemap.Integrations />
  <Basemap.Credentials />
</Main>
