<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  observerContainer?: boolean
}

let { children, class: className = '', observerContainer = false }: Props = $props()
</script>

<div
  class="{className} {observerContainer ? 'mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) md:px-8 xl:px-(--spacing-margin-desktop)' : ''}"
>
  <div class="border-t border-border-card/60"></div>
</div>
