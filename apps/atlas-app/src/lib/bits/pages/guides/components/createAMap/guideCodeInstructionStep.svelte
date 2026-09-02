<script lang="ts">
import GuideCodeBlock from '../shared/guideCodeBlock.svelte'
import GuideAttachedLayout from '../shared/guideAttachedLayout.svelte'
import GuideCardBlock from '../shared/guideCardBlock.svelte'
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

{#snippet commandCard()}
  <GuideCodeBlock
    label={codeLabel}
    {code}
    {copyable}
    {copyLabel}
    {copiedLabel}
    {language}
  />
{/snippet}

{#if instruction}
  <GuideAttachedLayout primaryWidth="shortCard">
    <GuideCardBlock card={commandCard} />
    {#snippet aside()}
      <GuideInstructionCallout {...instruction} />
    {/snippet}
  </GuideAttachedLayout>
{:else}
  <GuideCardBlock card={commandCard} />
{/if}
