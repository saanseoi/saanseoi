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

<div class="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
