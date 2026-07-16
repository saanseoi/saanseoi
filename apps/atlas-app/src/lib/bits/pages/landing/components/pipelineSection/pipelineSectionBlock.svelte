<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  href: string
  tone: 'source' | 'release' | 'api'
  number: string
  eyebrow: string
  title: string
  description: string
}
let { children, href, tone, number, eyebrow, title, description }: Props = $props()

const tones = {
  source: 'text-(--pipeline-source)',
  release: 'text-tertiary',
  api: 'text-secondary',
} as const
</script>

<a
  class={cn(
    'pipeline-stage group relative cursor-pointer py-8 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-current',
    `pipeline-stage-${tone}`,
  )}
  {href}
>
  {@render children?.()}
  <div
    class="transition-[filter,translate] duration-200 min-[768px]:group-hover:-translate-y-1 min-[768px]:group-hover:drop-shadow-[0_0.65rem_1rem_rgb(0_0_0/0.12)]"
  >
    <span
      class={cn(
        'pipeline-number transition-[scale] duration-200 group-hover:scale-105 group-focus-visible:scale-105',
        `pipeline-number-${tone}`,
        tones[tone],
      )}
      aria-hidden="true"
      >{number}</span
    >
    <p
      class={cn(
        'mt-5 font-body text-label-md font-semibold uppercase tracking-[0.18em]',
        tones[tone],
      )}
    >
      {eyebrow}
    </p>
    <h2 class="mt-1 font-display text-headline-md font-bold text-primary">{title}</h2>
    <p class="mt-2 max-w-xs font-body text-body-md leading-6 text-foreground-alt">
      {description}
    </p>
  </div>
</a>
