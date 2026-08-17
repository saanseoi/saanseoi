<script lang="ts">
import { SiteFooter } from '#lib/bits/patterns/site-footer/index.js'
import CommunitySectionNewsletter from './communitySectionNewsletter.svelte'
</script>

<section class="landing-community-closing" aria-label="Stay in touch">
  <CommunitySectionNewsletter />
  <SiteFooter />
</section>

<style>
.landing-community-closing {
  display: grid;
  min-height: 100svh;
  grid-template-rows: minmax(0, 1fr) auto;
}

@media (max-width: 900px) {
  .landing-community-closing :global(.landing-newsletter) {
    margin-bottom: 1.25rem;
  }
}

@media (min-width: 901px) {
  .landing-community-closing {
    grid-template-rows: minmax(33rem, 1fr) auto;
  }

  .landing-community-closing :global(.landing-newsletter) {
    align-self: stretch;
  }

  .landing-community-closing :global(footer) {
    position: relative;
    z-index: 1;
  }
}
</style>
