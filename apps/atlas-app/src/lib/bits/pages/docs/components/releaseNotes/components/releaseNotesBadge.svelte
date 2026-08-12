<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  tone: 'saanseoi' | 'red' | 'orange' | 'blue' | 'black'
  nested?: boolean
  children?: Snippet
}

let { tone, nested = false, children }: Props = $props()

const toneClasses = {
  saanseoi:
    'border-primary bg-primary font-display text-on-primary dark:border-primary',
  red: 'border-red-600/60 bg-red-100 font-display text-red-800 dark:border-red-400/60 dark:bg-red-950/60 dark:text-red-200',
  orange:
    'border-orange-600/60 bg-orange-100 px-1.5 font-display text-orange-800 dark:border-orange-400/60 dark:bg-orange-950/60 dark:text-orange-200',
  blue: 'border-blue-600/60 bg-blue-100 font-display text-blue-800 dark:border-blue-400/60 dark:bg-blue-950/60 dark:text-blue-200',
  black:
    'border-outline-variant bg-surface-container-highest px-1.5 font-mono text-on-surface dark:border-outline-variant dark:bg-surface-container-highest dark:text-primary',
} as const

const padding = $derived(
  tone === 'orange'
    ? ''
    : tone === 'saanseoi'
      ? nested
        ? 'px-0.5'
        : 'px-0.75'
      : nested
        ? 'px-1'
        : 'px-1.5',
)
const textSize = $derived(
  tone === 'black'
    ? 'text-[0.78em] font-medium'
    : 'text-[0.82em] font-semibold tracking-tight',
)
</script>

<span
  class={`not-prose mx-0.75 inline-flex items-center gap-1 rounded-sm border py-0.5 leading-none ${toneClasses[tone]} ${padding} ${textSize}`}
  >{@render children?.()}</span
>
