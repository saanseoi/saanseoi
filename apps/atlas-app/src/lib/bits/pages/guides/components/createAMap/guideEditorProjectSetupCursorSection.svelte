<script lang="ts">
import cursorIdeMode from '#lib/assets/guides/editor-cursor-ide-mode.png'
import cursorOpenFolder from '#lib/assets/guides/editor-cursor-open-folder.png'
import { m } from '#lib/bits/internal/i18n.js'
import GuideScreenshot from '#lib/bits/pages/guides/components/shared/guideScreenshot.svelte'
</script>

<div class="my-6 w-full space-y-6">
  <GuideScreenshot
    src={cursorOpenFolder}
    alt={m.guide_setup_editor_cursor_image_alt()}
    caption={m.guide_setup_editor_cursor_image_caption()}
  />
  <GuideScreenshot
    src={cursorIdeMode}
    alt={m.guide_setup_editor_cursor_ide_mode_image_alt()}
    caption={m.guide_setup_editor_cursor_ide_mode_image_caption()}
  />
</div>
