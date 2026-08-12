<script lang="ts">
import type { Snippet } from 'svelte'

type Props = { children?: Snippet }

let { children }: Props = $props()
</script>

<div role="tabpanel" data-release-nav-content-body class="grid gap-6 pt-4 lg:pt-0">
  {@render children?.()}
</div>
