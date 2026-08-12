<script lang="ts">
import type { Snippet } from 'svelte'

let {
  children,
  label,
  valueClass = '',
  valueTitle,
}: {
  children: Snippet
  label: string
  valueClass?: string
  valueTitle?: string
} = $props()
</script>

<dt class="text-(--bar-muted)">{label}</dt>
<dd class={`m-0 ${valueClass}`} title={valueTitle}>
  {@render children()}
</dd>
