<script lang="ts">
import GuideStepLabel from '../shared/guideStepLabel.svelte'

type Props = {
  description: string
  label?: string
  stepNumber?: number
  stepLabel?: string
  title: string
}

let { description, label, stepNumber, stepLabel, title }: Props = $props()
</script>

<div
  class="border-l-2 border-secondary pl-4 [&>h4]:mt-[0.35rem] [&>h4]:font-display [&>h4]:text-base [&>h4]:font-bold [&>h4]:text-primary [&>p:last-child]:mt-[0.45rem] [&>p:last-child]:font-body [&>p:last-child]:text-sm [&>p:last-child]:leading-[1.6] [&>p:last-child]:text-foreground-alt"
>
  {#if stepNumber && stepLabel}
    <p
      class="m-0 font-mono text-[0.7rem] font-bold tracking-[0.08em] text-secondary uppercase"
    >
      <GuideStepLabel number={stepNumber} label={stepLabel} />
    </p>
  {:else if label}
    <p
      class="m-0 font-mono text-[0.7rem] font-bold tracking-[0.08em] text-secondary uppercase"
    >
      {@html label}
    </p>
  {/if}
  <h4>{@html title}</h4>
  <p>{@html description}</p>
</div>
