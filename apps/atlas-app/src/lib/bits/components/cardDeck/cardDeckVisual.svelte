<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>

<span class={cn(className)} aria-hidden="true"> {@render children?.()} </span>
