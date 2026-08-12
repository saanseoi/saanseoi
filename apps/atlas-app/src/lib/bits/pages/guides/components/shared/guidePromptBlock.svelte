<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

import GuideCodeBlock from './guideCodeBlock.svelte'

type Props = {
  code: string
  promptIcon?: string
}

let { code, promptIcon }: Props = $props()
</script>

<GuideCodeBlock
  label={m.guide_llm_modal_prompt_label()}
  {code}
  variant="prompt"
  {promptIcon}
  copyLabel={m.common_copy()}
  copiedLabel={m.common_copied()}
/>
