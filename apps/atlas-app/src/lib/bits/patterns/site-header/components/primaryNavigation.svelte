<script lang="ts">
import Icon from '@iconify/svelte'

import { Button } from '$lib/bits/primitives/button'

import { navigationItems } from './navigationItems'
</script>

<nav
  aria-label="Primary navigation"
  class="hidden items-center justify-center gap-4 mobile:flex"
>
  {#each navigationItems as item}
    <Button
      class="hidden px-2 text-[1.02rem] font-light tracking-[-0.01em] text-foreground-alt hover:text-foreground [@container(max-width:859px)]:hidden [@container(min-width:860px)]:inline-flex"
      href={item.href}
      size="compact"
      variant="text"
    >
      {item.label()}
    </Button>

    <Button
      class="hidden size-12 min-h-12 px-0 text-foreground-alt hover:text-foreground [@container(max-width:859px)]:inline-flex [@container(min-width:860px)]:hidden"
      href={item.href}
      size="compact"
      variant="text"
    >
      <span class="sr-only">{item.label()}</span>
      <Icon aria-hidden="true" class="size-6" icon={item.icon} />
    </Button>
  {/each}
</nav>
