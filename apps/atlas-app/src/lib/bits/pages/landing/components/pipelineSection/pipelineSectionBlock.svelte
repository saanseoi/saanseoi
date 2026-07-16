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

<a class={cn('pipeline-stage relative py-8', `pipeline-stage-${tone}`)} {href}>
  {@render children?.()}
  <span
    class={cn('pipeline-number', `pipeline-number-${tone}`, tones[tone])}
    aria-hidden="true"
    >{number}</span
  >
  <p
    class={cn('mt-5 font-body text-label-md font-semibold uppercase tracking-[0.18em]', tones[tone])}
  >
    {eyebrow}
  </p>
  <h2 class="mt-1 font-display text-headline-md font-bold text-primary">{title}</h2>
  <p class="mt-2 max-w-xs font-body text-body-md leading-6 text-foreground-alt">
    {description}
  </p>
</a>
