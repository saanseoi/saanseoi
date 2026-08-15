<script lang="ts">
import Icon from '@iconify/svelte'
import { Tooltip } from 'bits-ui'

import { Button } from '#lib/bits/primitives/button/index.js'

import { navigationItems } from './navigationItems'
</script>

<nav
  aria-label="Primary navigation"
  class="hidden items-center justify-center gap-4 [@container(max-width:859px)]:gap-2 md:flex"
>
  <Tooltip.Provider delayDuration={300}>
    {#each navigationItems as item}
      <Button
        class="hidden px-2 text-[1.02rem] font-light tracking-[-0.01em] text-foreground-alt hover:text-foreground [@container(max-width:859px)]:hidden [@container(min-width:860px)]:inline-flex"
        href={item.href}
        size="compact"
        variant="text"
      >
        {item.label()}
      </Button>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              class="hidden size-12 min-h-12 px-0 text-foreground-alt hover:text-foreground [@container(max-width:859px)]:inline-flex [@container(min-width:860px)]:hidden"
              href={item.href}
              size="compact"
              variant="text"
            >
              <span class="sr-only">{item.label()}</span>
              <Icon aria-hidden="true" class="size-6" icon={item.icon} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            class="z-70 rounded-default border border-border-card/60 bg-background-alt px-3 py-1.5 font-body text-(--text-label-sm) text-foreground shadow-popover"
            side="bottom"
            sideOffset={8}
          >
            {item.label()}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    {/each}
  </Tooltip.Provider>
</nav>
