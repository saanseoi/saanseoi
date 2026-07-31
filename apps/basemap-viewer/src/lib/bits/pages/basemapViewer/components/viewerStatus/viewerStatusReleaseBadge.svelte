<script lang="ts">
import type { Theme } from '../../../../../types'

let {
  className = '',
  label,
  theme,
}: {
  className?: string
  label: string
  theme: Theme
} = $props()
</script>

<div
  class={`${className} rounded border border-(--bar-border) bg-(--bar-background) px-2 py-1 text-xs font-semibold text-(--bar-text) shadow`}
  data-bar-theme={theme}
>
  {label}
</div>
