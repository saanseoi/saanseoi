<script lang="ts">
import type { PolicySection } from '../types'

type Props = {
  section: PolicySection
}

let { section }: Props = $props()
</script>

<section class="space-y-4">
  <h3
    class="font-display text-[1.15rem] leading-tight font-bold tracking-headline-lg text-primary"
  >
    {section.heading}
  </h3>

  {#if section.paragraphs}
    <div class="space-y-3 font-body text-[0.98rem] leading-[1.8] text-foreground-alt">
      {#each section.paragraphs as paragraph}
        <p>{paragraph}</p>
      {/each}
    </div>
  {/if}

  {#if section.bullets}
    <ul
      class="list-disc space-y-1 pl-5 font-body text-[0.98rem] leading-[1.8] text-foreground-alt"
    >
      {#each section.bullets as bullet}
        <li class="policy-bullet">{bullet}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
.policy-bullet::marker {
  color: var(--secondary);
}
</style>
