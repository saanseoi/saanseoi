<script lang="ts">
import PolicySection from './policy-section.svelte'

import type { PolicySection as PolicySectionType } from '../types'

type Props = {
  badge: string
  description: string
  lang: string
  title: string
  intro: string[]
  sections: PolicySectionType[]
}

let { badge, description, lang, title, intro, sections }: Props = $props()
</script>

<article
  class="policy-document rounded-4xl border border-border-card/65 bg-background-alt p-7 shadow-card md:p-9"
  {lang}
>
  <div class="flex flex-wrap items-center gap-3">
    <span
      class="rounded-full border border-secondary/18 bg-secondary-container px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-on-secondary-container"
    >
      {badge}
    </span>
    <p class="font-body text-[0.82rem] leading-relaxed text-foreground-alt">
      {description}
    </p>
  </div>

  <div class="mt-6 space-y-4">
    <h2
      class="font-display text-[1.9rem] leading-[1.02] font-bold tracking-display-lg text-primary md:text-[2.3rem]"
    >
      {title}
    </h2>

    <div class="space-y-4 font-body text-body-md leading-[1.85] text-foreground-alt">
      {#each intro as paragraph}
        <p>{paragraph}</p>
      {/each}
    </div>
  </div>

  <div class="mt-8 space-y-8 border-t border-border-card/60 pt-8">
    {#each sections as section}
      <PolicySection {section} />
    {/each}
  </div>
</article>
