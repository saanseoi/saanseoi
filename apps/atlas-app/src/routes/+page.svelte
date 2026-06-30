<script lang="ts">
import { Main, Divider } from '$lib/bits'

import LandingFoundationGrid from '$lib/bits/pages/landing/foundationGrid.svelte'
import LandingHero from '$lib/bits/pages/landing/hero.svelte'
import LandingNewsletter from '$lib/bits/pages/landing/newsletter.svelte'
import LandingShowcase from '$lib/bits/pages/landing/showcase.svelte'
</script>

<Main>
  <LandingHero />
  <Divider />
  <LandingFoundationGrid />
  <LandingShowcase />
  <LandingNewsletter />
</Main>
