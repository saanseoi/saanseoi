<script lang="ts">
import GuideCalloutDescription from '../shared/guideCalloutDescription.svelte'
import GuideCalloutEyebrow from '../shared/guideCalloutEyebrow.svelte'
import GuideCalloutTitle from '../shared/guideCalloutTitle.svelte'
import GuideStepLabel from '../shared/guideStepLabel.svelte'

type Props = {
  class?: string
  description: string
  label?: string
  stepNumber?: number
  stepLabel?: string
  title: string
}

let {
  class: className = '',
  description,
  label,
  stepNumber,
  stepLabel,
  title,
}: Props = $props()
</script>

<div class={`border-l-2 border-secondary pl-4 ${className}`}>
  {#if stepNumber && stepLabel}
    <GuideCalloutEyebrow>
      <GuideStepLabel number={stepNumber} label={stepLabel} />
    </GuideCalloutEyebrow>
  {:else if label}
    <GuideCalloutEyebrow text={label} />
  {/if}
  <GuideCalloutTitle {title} />
  <GuideCalloutDescription {description} />
</div>
