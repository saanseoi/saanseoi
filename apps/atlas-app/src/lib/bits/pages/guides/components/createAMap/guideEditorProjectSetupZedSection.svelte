<script lang="ts">
import zedProjectReady from '$lib/assets/guides/editor-zed-project-ready.png'
import zedOpenProject from '$lib/assets/guides/zed-open-project.png'
import zedTrustProject from '$lib/assets/guides/zed-trust-project.png'
import { m } from '$lib/bits/internal/i18n'
import GuideScreenshot from '$lib/bits/pages/guides/components/shared/guideScreenshot.svelte'
</script>

<div class="my-6 w-full space-y-6">
  <GuideScreenshot
    src={zedOpenProject}
    alt={m.guide_setup_editor_zed_image_alt()}
    caption={m.guide_setup_editor_zed_image_caption()}
  />
  <p class="font-body text-body-md leading-7 text-foreground-alt">
    {@html m.guide_zed_setup_project_add_description()}
  </p>
  <GuideScreenshot
    src={zedTrustProject}
    alt={m.guide_zed_setup_image_project_trust_alt()}
  />
  <p class="font-body text-body-md leading-7 text-foreground-alt">
    {@html m.guide_zed_setup_trust_description()}
  </p>
  <GuideScreenshot
    src={zedProjectReady}
    alt={m.guide_setup_editor_zed_project_ready_image_alt()}
    caption={m.guide_setup_editor_zed_project_ready_image_caption()}
  />
</div>
