<script lang="ts">
import { Main, Divider } from '$lib/bits'

import LandingArchitecture from '$lib/bits/pages/landing/architecture.svelte'
import LandingFoundationGrid from '$lib/bits/pages/landing/foundationGrid.svelte'
import LandingHero from '$lib/bits/pages/landing/hero.svelte'
import LandingNewsletter from '$lib/bits/pages/landing/newsletter.svelte'
import LandingPipeline from '$lib/bits/pages/landing/pipeline.svelte'
// import LandingShowcase from '$lib/bits/pages/landing/showcase.svelte'
</script>

<Main>
  <LandingHero />
  <Divider />
  <LandingFoundationGrid />
  <Divider />
  <LandingArchitecture />
  <Divider />
  <LandingPipeline />
  <Divider />
  <LandingNewsletter />
  <Divider />
</Main>
