<script lang="ts">
import vscodeManageTrust from '$lib/assets/guides/editor-vscode-manage-trust.png'
import vscodeOpenFolder from '$lib/assets/guides/editor-vscode-open-folder.png'
import vscodeTrustedFolder from '$lib/assets/guides/editor-vscode-trusted-folder.png'
import { m } from '$lib/bits/internal/i18n'
import GuideScreenshot from '$lib/bits/pages/guides/components/shared/guideScreenshot.svelte'
</script>

<div class="my-6 w-full space-y-6">
  <GuideScreenshot
    src={vscodeOpenFolder}
    alt={m.guide_setup_editor_vscode_image_alt()}
    caption={m.guide_setup_editor_vscode_image_caption()}
  />
  <GuideScreenshot
    src={vscodeManageTrust}
    alt={m.guide_setup_editor_vscode_manage_trust_image_alt()}
    caption={m.guide_setup_editor_vscode_manage_trust_image_caption()}
  />
  <GuideScreenshot
    src={vscodeTrustedFolder}
    alt={m.guide_setup_editor_vscode_trusted_folder_image_alt()}
    caption={m.guide_setup_editor_vscode_trusted_folder_image_caption()}
  />
</div>
