<script lang="ts">
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import MappingIntegration from '#lib/bits/components/mappingIntegration.svelte'
import { apiIntegrations } from '#lib/bits/components/mappingIntegrations.js'
import { m } from '#lib/bits/internal/i18n.js'
</script>

<Seo
  title={m.api_get_started_title()}
  description={m.api_get_started_meta_description()}
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <section class="max-w-4xl">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      SaanSeoi APIs
    </p>
    <h1
      class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
    >
      Put SaanSeoi data on your map.
    </h1>
    <p class="mt-6 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
      Request a small set of divisions, turn its geometry into GeoJSON, and render it in
      the map you already have. Use a publishable SaanSeoi key for browser requests and
      request only the data your map needs.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <Button href="/sign-up" variant="primary">Create an account</Button>
      <Button href="/api-keys" variant="secondary">Manage API keys</Button>
    </div>
  </section>

  <MappingIntegration
    eyebrow="Render API data"
    heading="Use the same API response in every supported map library."
    description="SaanSeoi APIs use JSON:API. These snippets convert the returned geometries to standard GeoJSON before passing them to your library, including Google Maps Data layer."
    integrations={apiIntegrations}
  />

  <section
    class="mt-16 border-l-4 border-secondary bg-surface-container-low px-6 py-8 md:mt-24 md:px-10 md:py-10"
  >
    <h2 class="font-display text-headline-sm font-bold text-primary">
      Next: build a complete map.
    </h2>
    <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
      The complete guide combines data, a basemap, a theme, and publishing when you need
      more than one layer.
    </p>
    <Button class="mt-6" href="/guides/create-a-map" variant="secondary"
      >Open Create a Map</Button
    >
  </section>
</Main>
