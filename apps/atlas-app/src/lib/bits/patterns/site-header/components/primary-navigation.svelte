<script lang="ts">
import { Button } from '$lib/bits/primitives/button'

import { navigationItems } from './navigation-items'
</script>

<nav
  aria-label="Primary navigation"
  class="hidden items-center justify-center gap-4 md:flex"
>
  {#each navigationItems as item}
    <Button
      class="px-2 text-[1.02rem] font-light tracking-[-0.01em] text-foreground-alt hover:text-foreground"
      href={item.href}
      size="compact"
      variant="text"
    >
      {item.label()}
    </Button>
  {/each}
</nav>
