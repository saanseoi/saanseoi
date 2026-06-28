<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type SwapTransition = 'fade' | 'rotate' | 'flip'

type Props = {
  'aria-label'?: string
  checked?: boolean
  class?: string
  disabled?: boolean
  id?: string
  indeterminate?: boolean
  name?: string
  off?: Snippet
  onCheckedChange?: (checked: boolean) => void
  on?: Snippet
  required?: boolean
  transition?: SwapTransition
  value?: string
}

let {
  'aria-label': ariaLabel,
  checked = $bindable(false),
  class: className = '',
  disabled = false,
  id,
  indeterminate = $bindable(false),
  name,
  off,
  onCheckedChange,
  on,
  required = false,
  transition = 'fade',
  value,
}: Props = $props()

let inputElement = $state<HTMLInputElement | null>(null)

$effect(() => {
  if (inputElement) {
    inputElement.indeterminate = indeterminate
  }
})

function handleChange(event: Event) {
  const target = event.currentTarget as HTMLInputElement
  checked = target.checked
  indeterminate = target.indeterminate
  onCheckedChange?.(target.checked)
}
</script>

<label
  class={cn(
    'swap relative inline-grid cursor-pointer place-content-center align-middle select-none',
    transition === 'rotate' && 'swap-rotate',
    transition === 'flip' && 'swap-flip',
    checked && 'swap-active',
    className
  )}
>
  <input
    bind:checked
    bind:this={inputElement}
    aria-label={ariaLabel}
    class="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
    {disabled}
    {id}
    {name}
    {required}
    {value}
    onchange={handleChange}
    type="checkbox"
  >

  <span aria-hidden="true" class="swap-face swap-off"> {@render off?.()} </span>

  <span aria-hidden="true" class="swap-face swap-on"> {@render on?.()} </span>
</label>

<style>
.swap-face {
  grid-column: 1;
  grid-row: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .swap-face {
    transition-duration: 0.2s;
    transition-property: transform, rotate, opacity;
    transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}

.swap-on {
  opacity: 0;
}

.swap-active .swap-off {
  opacity: 0;
}

.swap :checked ~ .swap-off,
.swap :indeterminate ~ .swap-off {
  opacity: 0;
}

.swap :checked ~ .swap-on,
.swap :indeterminate ~ .swap-on,
.swap-active .swap-on {
  opacity: 1;
  backface-visibility: visible;
}

.swap-rotate .swap-on {
  rotate: 45deg;
}

.swap-rotate :checked ~ .swap-on,
.swap-rotate :indeterminate ~ .swap-on,
.swap-rotate.swap-active .swap-on {
  rotate: 0deg;
}

.swap-rotate :checked ~ .swap-off,
.swap-rotate :indeterminate ~ .swap-off,
.swap-rotate.swap-active .swap-off {
  rotate: -45deg;
}

.swap-flip {
  perspective: 20rem;
  transform-style: preserve-3d;
}

.swap-flip .swap-on {
  backface-visibility: hidden;
  transform: rotateY(180deg);
}

.swap-flip :checked ~ .swap-on,
.swap-flip :indeterminate ~ .swap-on,
.swap-flip.swap-active .swap-on {
  transform: rotateY(0deg);
}

.swap-flip :checked ~ .swap-off,
.swap-flip :indeterminate ~ .swap-off,
.swap-flip.swap-active .swap-off {
  backface-visibility: hidden;
  opacity: 1;
  transform: rotateY(-180deg);
}
</style>
