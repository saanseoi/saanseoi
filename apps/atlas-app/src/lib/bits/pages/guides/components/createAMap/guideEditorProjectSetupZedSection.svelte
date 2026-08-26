<script lang="ts">
import zedProjectReady from '#lib/assets/guides/editor-zed-project-ready.png'
import zedOpenProject from '#lib/assets/guides/zed-open-project.png'
import zedTrustProject from '#lib/assets/guides/zed-trust-project.png'
import { m } from '#lib/bits/internal/i18n.js'
import GuideParagraph from '#lib/bits/pages/guides/components/shared/guideParagraph.svelte'
import GuideScreenshot from '#lib/bits/pages/guides/components/shared/guideScreenshot.svelte'

import GuideZedProjectPreparation from './guideZedProjectPreparation.svelte'

type Props = {
  instruction?: string
}

let { instruction }: Props = $props()
</script>

<div class="my-6 w-full space-y-6">
  <GuideScreenshot src={zedOpenProject} alt={m.guide_setup_editor_zed_image_alt()} />
  {#if instruction}
    <GuideParagraph>{@html instruction}</GuideParagraph>
  {/if}
  <GuideZedProjectPreparation
    class="space-y-6"
    projectTrustImage={zedTrustProject}
    projectReadyImage={zedProjectReady}
    projectReadyAlt={m.guide_setup_editor_zed_project_ready_image_alt()}
    projectReadyCaption={m.guide_setup_editor_zed_project_ready_image_caption()}
  />
</div>
