<script lang="ts">
import sublimeAddFolder from '#lib/assets/guides/editor-sublime-add-folder.png'
import sublimeShowSidebar from '#lib/assets/guides/editor-sublime-show-sidebar.png'
import { m } from '#lib/bits/internal/i18n.js'
import GuideScreenshot from '#lib/bits/pages/guides/components/shared/guideScreenshot.svelte'
</script>

<div class="my-6 w-full space-y-6">
  <GuideScreenshot
    src={sublimeAddFolder}
    alt={m.guide_setup_editor_sublime_text_image_alt()}
    caption={m.guide_setup_editor_sublime_text_image_caption()}
  />
  <GuideScreenshot
    src={sublimeShowSidebar}
    alt={m.guide_setup_editor_sublime_text_show_sidebar_image_alt()}
    caption={m.guide_setup_editor_sublime_text_show_sidebar_image_caption()}
  />
</div>
