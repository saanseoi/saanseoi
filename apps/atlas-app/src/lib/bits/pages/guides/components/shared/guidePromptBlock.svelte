<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'

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
  onCopy={outcome =>
    trackClientProductUsage({
      event: 'guide.prompt_copy',
      surface: 'guide',
      entityType: 'action',
      entityId: 'prompt',
      outcome,
    })}
  copyLabel={m.common_copy()}
  copiedLabel={m.common_copied()}
/>
