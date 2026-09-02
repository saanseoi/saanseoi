<script lang="ts">
import { GuideCodeBlock } from '#lib/bits/pages/guides/index.js'

type Props = {
  class?: string
  code: string
  commandLabel: string
  copyLabel: string
  copiedLabel: string
  description?: string
  language: 'bash' | 'powershell'
  output?: string
  outputLabel?: string
}

let {
  class: className = 'mt-3',
  code,
  commandLabel,
  copyLabel,
  copiedLabel,
  description,
  language,
  output,
  outputLabel,
}: Props = $props()
</script>

{#if description}
  <p class="font-body text-body-lg leading-8 text-foreground-alt">
    {@html description}
  </p>
{/if}
<GuideCodeBlock
  class={className}
  label={commandLabel}
  {code}
  {language}
  {copyLabel}
  {copiedLabel}
/>
{#if output && outputLabel}
  <GuideCodeBlock
    class="mt-4"
    code={output}
    label={outputLabel}
    copyable={false}
    {copyLabel}
    {copiedLabel}
  />
{/if}
