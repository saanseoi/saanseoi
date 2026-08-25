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

<div
  class={`grid gap-6 ${instruction ? 'md:grid-cols-[minmax(0,1fr)_16rem] md:items-start lg:-mr-56 lg:w-[calc(100%+14rem)] lg:grid-cols-[minmax(0,1fr)_minmax(16rem,26rem)]' : ''}`}
>
  <GuideCodeBlock
    label={codeLabel}
    {code}
    {copyable}
    {copyLabel}
    {copiedLabel}
    {language}
  />
  {#if instruction}
    <aside>
      <GuideInstructionCallout {...instruction} />
    </aside>
  {/if}
</div>
