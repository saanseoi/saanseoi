<script lang="ts">
import { Main, Seo } from '#lib/bits/index.js'
import { m } from '#lib/bits/internal/i18n.js'
</script>

<Seo
  title={m.nav_community()}
  description={m.community_coming_soon_description()}
  noindex={true}
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-18"
>
  <p class="font-body text-label-md font-semibold uppercase text-secondary">
    {m.nav_community()}
  </p>
  <h1
    class="mt-2 font-display text-headline-lg font-bold text-primary md:text-display-md"
  >
    {m.nav_community()}
  </h1>
  <p class="mt-4 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {m.community_coming_soon_description()}
  </p>
</Main>
