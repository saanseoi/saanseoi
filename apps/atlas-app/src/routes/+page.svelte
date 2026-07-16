<script lang="ts">
import { Main, Divider } from '$lib/bits'

import HeroSection from '$lib/bits/pages/landing/heroSection.svelte'
import CommunitySection from '$lib/bits/pages/landing/communitySection.svelte'
import FeatureSection from '$lib/bits/pages/landing/featureSection.svelte'
import FoundationSection from '$lib/bits/pages/landing/foundationSection.svelte'
import PipelineSection from '$lib/bits/pages/landing/pipelineSection.svelte'
</script>

<Main>
  <HeroSection />
  <Divider />
  <FoundationSection />
  <Divider />
  <FeatureSection />
  <Divider />
  <PipelineSection />
  <Divider />
  <CommunitySection />
  <Divider />
</Main>
