<script lang="ts">
import { Button } from '#lib/bits/primitives/button/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import MappingIntegration from '#lib/bits/components/mappingIntegration.svelte'
import { themeIntegrations } from '#lib/bits/components/mappingIntegrations.js'
</script>

<Seo
  title="Use a SaanSeoi map style"
  description="Apply a SaanSeoi map style with your mapping library."
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <section class="max-w-4xl">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      SaanSeoi themes
    </p>
    <h1
      class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
    >
      Use a ready-made visual language for your map.
    </h1>
    <p class="mt-6 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
      Choose a SaanSeoi theme, then load its MapLibre style JSON into a compatible
      renderer. It controls how the basemap looks; it does not add data or change your
      map library.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <Button href="/themes" variant="primary">Browse themes</Button>
      <Button href="/guides/create-a-map" variant="secondary"
        >Build a complete map</Button
      >
    </div>
  </section>

  <MappingIntegration
    eyebrow="Use a theme"
    heading="Load a style, then make it your own."
    description="MapLibre-compatible renderers can load SaanSeoi styles directly. We show the correct alternative where a library has a different style model."
    integrations={themeIntegrations}
  />

  <section
    class="mt-16 border-l-4 border-secondary bg-surface-container-low px-6 py-8 md:mt-24 md:px-10 md:py-10"
  >
    <h2 class="font-display text-headline-sm font-bold text-primary">
      Next: add data or publish the whole map.
    </h2>
    <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
      A theme works best alongside a basemap and your own data layers. The full guide
      connects those steps without requiring you to follow them before you are ready.
    </p>
    <Button class="mt-6" href="/guides/create-a-map" variant="secondary"
      >Open Create a Map</Button
    >
  </section>
</Main>
