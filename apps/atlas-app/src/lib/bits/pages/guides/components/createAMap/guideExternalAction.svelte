<script lang="ts">
import Icon from '@iconify/svelte'
import type { Snippet } from 'svelte'

import { Button } from '$lib/bits/primitives/button'

type Props = {
  children?: Snippet
  href: string
  icon: string
}

let { children, href, icon }: Props = $props()
</script>

<Button {href} target="_blank" rel="noreferrer" size="compact" variant="secondary">
  <Icon {icon} class="size-4" aria-hidden="true" />
  {@render children?.()}
</Button>
