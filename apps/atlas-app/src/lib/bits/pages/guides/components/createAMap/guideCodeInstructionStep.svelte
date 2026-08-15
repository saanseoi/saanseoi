<script lang="ts">
import GuideCodeBlock from '../shared/guideCodeBlock.svelte'
import GuideInstructionCallout from './guideInstructionCallout.svelte'

type Props = {
  code: string
  codeLabel: string
  copyable?: boolean
  copiedLabel: string
  copyLabel: string
  instruction?: {
    description: string
    label?: string
    stepLabel?: string
    stepNumber?: number
    title: string
  }
  language?: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
}

let {
  code,
  codeLabel,
  copyable = true,
  copiedLabel,
  copyLabel,
  instruction,
  language,
}: Props = $props()
</script>

<div class="space-y-6">
  <GuideCodeBlock
    label={codeLabel}
    {code}
    {copyable}
    {copyLabel}
    {copiedLabel}
    {language}
  />
  {#if instruction}
    <GuideInstructionCallout {...instruction} />
  {/if}
</div>
