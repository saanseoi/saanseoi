<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideParagraph from '../shared/guideParagraph.svelte'
import GuideScreenshot from '../shared/guideScreenshot.svelte'

type Props = {
  class?: string
  projectReadyAlt: string
  projectReadyCaption: string
  projectReadyImage: string
  projectTrustImage: string
}

let {
  class: className = 'space-y-4',
  projectReadyAlt,
  projectReadyCaption,
  projectReadyImage,
  projectTrustImage,
}: Props = $props()
</script>

<div class={className}>
  <GuideScreenshot
    src={projectTrustImage}
    alt={m.guide_zed_setup_image_project_trust_alt()}
  />
  <GuideParagraph> {@html m.guide_zed_setup_trust_description()} </GuideParagraph>
  <GuideScreenshot
    src={projectReadyImage}
    alt={projectReadyAlt}
    caption={projectReadyCaption}
  />
</div>
