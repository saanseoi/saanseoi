<script lang="ts">
import type { Theme } from '../../../types'
import { SelectMenu } from '../../primitives/selectMenu'

export type ReleaseOption = { label: string; value: string }

let {
  className = '',
  label,
  options,
  onValueChange,
  style,
  theme,
  value,
}: {
  className?: string
  label: string
  options?: ReleaseOption[]
  onValueChange?: (value: string) => void
  style?: string
  theme: Theme
  value?: string
} = $props()

const badgeClass =
  'rounded border border-(--bar-border) bg-(--bar-background) px-2 py-1 text-xs font-semibold text-(--bar-text) shadow'
</script>

{#if options && value && onValueChange}
  <SelectMenu
    ariaLabel={label}
    items={options}
    {onValueChange}
    placeholder={label}
    {style}
    {theme}
    triggerClass={className}
    {value}
    valueLabel={label}
    variant="badge"
  />
{:else}
  <div class={`${className} ${badgeClass}`} data-bar-theme={theme} {style}>
    {label}
  </div>
{/if}
