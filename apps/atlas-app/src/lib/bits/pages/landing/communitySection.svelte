<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import * as Community from './components/communitySection'
import * as Pipeline from './components/pipelineSection'
</script>

<Community.Root class="min-h-0">
  <Pipeline.Content class="landing-community-pipeline pb-5">
    <Pipeline.Header
      title={m.community_spaces_title()}
      description={m.community_spaces_description()}
      descriptionMaxWidth="600px"
      titleId="community-spaces-title"
    />
    <Community.Spaces />
  </Pipeline.Content>
</Community.Root>

<style>
@media (max-width: 900px) {
  :global(section.landing-community-section),
  :global(div.landing-community-pipeline) {
    min-height: 0;
  }

  :global(div.landing-community-pipeline) {
    padding-bottom: 1.25rem;
  }
}

@media (min-width: 901px) and (max-width: 1023px) {
  :global(div.landing-community-pipeline) {
    padding-top: calc(clamp(2.25rem, 5svh, 3.5rem) + 4.5rem + 24px);
  }
}

@media (min-width: 901px) and (max-height: 650px) {
  :global(div.landing-community-pipeline) {
    padding-top: 4.5rem;
  }
}

@media (min-width: 120rem) and (max-height: 820px) {
  :global(div.landing-community-pipeline) {
    padding-top: 4.5rem;
  }
}

@media (min-width: 120rem) and (max-height: 550px) {
  :global(div.landing-community-pipeline) {
    padding-top: 0;
  }

  :global(.landing-community-pipeline .community-spaces-grid) {
    transform: translateY(-0.75rem);
  }
}

@media (min-width: 901px) and (max-height: 500px) {
  :global(div.landing-community-pipeline) {
    padding-top: 0;
  }

  :global(.landing-community-pipeline .community-spaces-grid) {
    transform: translateY(-0.75rem);
  }
}
</style>
