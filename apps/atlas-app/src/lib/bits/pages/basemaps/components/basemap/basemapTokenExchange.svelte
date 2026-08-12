<script lang="ts">
import { getCurrentLocale } from '$lib/bits/internal/i18n'

import CodeBlock from './basemapCodeBlock.svelte'
import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}

const publicKeyExample = [
  'const accessToken = import.meta.env.VITE_SAANSEOI_API_KEY',
  "if (!accessToken?.startsWith('pk.')) {",
  "  throw new Error('Set VITE_SAANSEOI_API_KEY to your SaanSeoi public key.')",
  '}',
].join('\n')
</script>

<section
  class="mt-16 grid gap-10 border-t border-border-card pt-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 md:mt-24 md:pt-14"
>
  <div>
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {t('tiles_getting_started_exchange_key')}
    </p>
    <h2 class="mt-3 font-display text-headline-md font-bold text-primary">
      {t('tiles_getting_started_exchange_heading')}
    </h2>
    <div class="mt-5 space-y-4 font-body text-body-md leading-7 text-foreground-alt">
      <p>{t('tiles_getting_started_exchange_intro_before_endpoint')}</p>
      <p>{t('tiles_getting_started_exchange_browser')}</p>
    </div>
  </div>
  <CodeBlock
    code={publicKeyExample}
    label={t('tiles_getting_started_public_key_code')}
  />
</section>
