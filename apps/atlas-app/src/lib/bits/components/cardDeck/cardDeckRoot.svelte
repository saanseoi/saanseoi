<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>

<div class={cn(className)}>
  {@render children?.()}
</div>
