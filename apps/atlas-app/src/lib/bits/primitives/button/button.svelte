<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'text'
type Size = 'compact' | 'default'

type Props = {
  children?: Snippet
  class?: string
  disabled?: boolean
  href?: string
  rel?: string
  size?: Size
  target?: string
  type?: 'button' | 'submit' | 'reset'
  variant?: Variant
}

const buttonVariantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-[color-mix(in_srgb,var(--primary)_88%,var(--background-alt))]',
  secondary:
    'border border-foreground/35 bg-muted text-foreground hover:bg-[color-mix(in_srgb,var(--muted)_88%,var(--background-alt))]',
  ghost:
    'bg-surface-container-low text-foreground-alt hover:bg-[color-mix(in_srgb,var(--surface-container-low)_88%,var(--background-alt))] hover:text-foreground',
  text: 'text-foreground hover:text-secondary',
}

const linkVariantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:text-on-primary',
  secondary:
    'border border-foreground/35 bg-muted text-foreground hover:text-foreground',
  ghost: 'bg-surface-container-low text-foreground-alt hover:text-foreground',
  text: 'text-foreground hover:text-secondary',
}

const sizeClasses: Record<Size, string> = {
  compact: 'min-h-10 px-3 text-[0.92rem]',
  default: 'min-h-12 px-6 text-(--text-label-md)',
}

let {
  children,
  class: className = '',
  disabled = false,
  href,
  rel,
  size = 'default',
  target,
  type = 'button',
  variant = 'primary',
}: Props = $props()

const baseClasses =
  'focus-override button-focus-ring inline-flex items-center justify-center gap-2 rounded-default font-body font-semibold tracking-[0.01em] transition-colors'

const anchorClasses = $derived(linkVariantClasses[variant])
const buttonClasses = $derived(buttonVariantClasses[variant])
</script>

{#if href}
  <a
    class={cn(
      baseClasses,
      sizeClasses[size],
      anchorClasses,
      'focus-visible:ring-offset-background',
      className
    )}
    {href}
    {rel}
    {target}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    class={cn(
      baseClasses,
      sizeClasses[size],
      buttonClasses,
      'focus-visible:ring-offset-background',
      className
    )}
    {disabled}
    {type}
  >
    {@render children?.()}
  </button>
{/if}
