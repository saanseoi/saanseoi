<script lang="ts">
import GuideProgressMarker from './guideProgressMarker.svelte'

type Props = {
  eyebrow?: string
  requirement?: {
    current: number
    label: string
    total: number
  }
  title: string
}

let { eyebrow, requirement, title }: Props = $props()
</script>

{#if eyebrow || requirement}
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {#if requirement}
      <GuideProgressMarker {...requirement} />
    {:else if eyebrow}
      {@html eyebrow}
    {/if}
  </p>
{/if}
<h3 class="mt-1 font-display text-headline-md leading-tight font-bold text-primary">
  {@html title}
</h3>
