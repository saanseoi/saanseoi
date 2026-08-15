<script lang="ts">
import { Button } from '#lib/bits/index.js'
import { getCurrentLocale } from '#lib/bits/internal/i18n.js'

import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}
</script>

<section class="max-w-4xl">
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {t('tiles_getting_started_eyebrow')}
  </p>
  <h1
    class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
  >
    {t('tiles_getting_started_hero')}
  </h1>
  <p class="mt-6 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {t('tiles_getting_started_description')}
  </p>
  <div class="mt-8 flex flex-wrap gap-3">
    <Button href="/sign-up" variant="primary">{t('auth_create_account')}</Button>
    <Button href="/api-keys" variant="secondary">{t('account_manage_api_keys')}</Button>
  </div>
</section>
