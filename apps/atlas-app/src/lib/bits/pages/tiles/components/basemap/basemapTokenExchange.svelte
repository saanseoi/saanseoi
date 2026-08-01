<script lang="ts">
import { getCurrentLocale } from '$lib/bits/internal/i18n'

import CodeBlock from './basemapCodeBlock.svelte'
import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}

const tokenEndpointExample = [
  '// Your server only — never send SAANSEOI_API_KEY to the browser.',
  'export async function GET() {',
  "  const response = await fetch('https://api.saanseoi.hk/v0/auth/tokens', {",
  "    method: 'POST',",
  '    headers: {',
  "      'content-type': 'application/json',",
  "      'x-api-key': process.env.SAANSEOI_API_KEY,",
  '    },',
  "    body: JSON.stringify({ audience: 'basemap-tiles' }),",
  '  })',
  '',
  "  if (!response.ok) return new Response('Could not get a tile token', { status: 502 })",
  '  const { accessToken, expiresIn } = await response.json()',
  '  return Response.json({ accessToken, expiresIn }, {',
  "    headers: { 'cache-control': 'private, no-store' },",
  '  })',
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
      <p>
        {t('tiles_getting_started_exchange_intro_before_endpoint')}
        <code class="font-mono text-sm text-foreground"
          >POST https://api.saanseoi.hk/v0/auth/tokens</code
        >
        {t('tiles_getting_started_exchange_intro_before_audience')}
        <code class="font-mono text-sm text-foreground">basemap-tiles</code>
        {t('tiles_getting_started_exchange_intro_after_audience')}
      </p>
      <p>{t('tiles_getting_started_exchange_browser')}</p>
    </div>
  </div>
  <CodeBlock
    code={tokenEndpointExample}
    label={t('tiles_getting_started_server_route')}
  />
</section>
