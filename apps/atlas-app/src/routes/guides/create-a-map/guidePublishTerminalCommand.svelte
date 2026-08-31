<script lang="ts">
import { GuideCodeBlock } from '#lib/bits/pages/guides/index.js'

type Props = {
  code: string
  commandLabel: string
  copyLabel: string
  copiedLabel: string
  description: string
  language: 'bash' | 'powershell'
  output?: string
  outputLabel?: string
}

let {
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

<p class="font-body text-body-md leading-7 text-foreground-alt">
  {@html description}
</p>
<GuideCodeBlock
  class="mt-3"
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
