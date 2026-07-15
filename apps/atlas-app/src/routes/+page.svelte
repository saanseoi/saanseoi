<script lang="ts">
import { Main, Divider } from '$lib/bits'

import LandingHero from '$lib/bits/pages/landing/hero.svelte'
import LandingCommunitySection from '$lib/bits/pages/landing/communitySection.svelte'
import LandingFeatureSection from '$lib/bits/pages/landing/featureSection.svelte'
import LandingFoundationSection from '$lib/bits/pages/landing/foundationSection.svelte'
import LandingPipelineSection from '$lib/bits/pages/landing/pipelineSection.svelte'
// import LandingShowcase from '$lib/bits/pages/landing/showcase.svelte'
</script>

<Main>
  <LandingHero />
  <Divider />
  <LandingFoundationSection />
  <Divider />
  <LandingFeatureSection />
  <Divider />
  <LandingPipelineSection />
  <Divider />
  <LandingCommunitySection />
  <Divider />
</Main>
