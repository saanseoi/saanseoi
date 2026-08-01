<script lang="ts">
import { getCurrentLocale } from '$lib/bits/internal/i18n'

import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}
</script>

<section
  class="mt-16 border-l-4 border-secondary bg-surface-container-low px-6 py-8 md:mt-24 md:px-10 md:py-10"
>
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {t('tiles_getting_started_keep_credentials')}
  </p>
  <div class="mt-5 grid gap-6 md:grid-cols-3">
    <div>
      <h2 class="font-display text-headline-sm font-bold text-primary">
        {t('tiles_getting_started_account_title')}
      </h2>
      <p class="mt-2 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_account_body')}
      </p>
    </div>
    <div>
      <h2 class="font-display text-headline-sm font-bold text-primary">
        {t('tiles_getting_started_api_key_title')}
      </h2>
      <p class="mt-2 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_api_key_body')}
      </p>
    </div>
    <div>
      <h2 class="font-display text-headline-sm font-bold text-primary">
        {t('tiles_getting_started_bearer_token_title')}
      </h2>
      <p class="mt-2 font-body text-body-md leading-7 text-foreground-alt">
        {t('tiles_getting_started_bearer_token_body')}
      </p>
    </div>
  </div>
  <p
    class="mt-6 max-w-4xl border-t border-border-card pt-6 font-body text-body-md leading-7 text-foreground-alt"
  >
    {t('tiles_getting_started_security_note_before_origin')}
    <code class="font-mono text-sm text-foreground">Origin</code>
    {t('tiles_getting_started_security_note_after_origin')}
  </p>
</section>
