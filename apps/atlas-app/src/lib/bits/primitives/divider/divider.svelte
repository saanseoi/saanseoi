<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<div
  class="mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) md:px-8 xl:px-(--spacing-margin-desktop)"
>
  <div class="border-t border-border-card/60"></div>
</div>
