<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { LanguageSelector } from '$lib/bits/components/language-selector'

import DarkModeToggle from './dark-mode-toggle.svelte'
import { navigationItems } from './navigation-items'

let mobileMenuOpen = $state(false)
</script>

<Dialog.Root bind:open={mobileMenuOpen}>
  <Dialog.Trigger
    aria-label="Open navigation menu"
    class="inline-flex size-11 items-center justify-center rounded-default border border-border-card/70 bg-muted text-foreground transition-colors hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background mobile:hidden"
  >
    <Icon icon="proicons:menu" class="size-5" />
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm mobile:hidden"
    />
    <Dialog.Content
      class="fixed right-5 top-5 z-50 flex w-[min(calc(100vw-2.5rem),22rem)] flex-col gap-6 rounded-lg border-2 border-foreground/90 bg-background-alt p-5 text-foreground shadow-popover focus:outline-none mobile:hidden"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <Dialog.Title
            class="font-display text-(--text-headline-md) font-bold leading-headline-md tracking-headline-lg text-foreground"
          >
            {m.saanseoi()}
          </Dialog.Title>
          <Dialog.Description
            class="max-w-[18rem] font-body text-(--text-body-md) leading-(--leading-body-md) text-foreground-alt"
          >
            {m.nav_mobile_description()}
          </Dialog.Description>
        </div>

        <Dialog.Close
          aria-label="Close navigation menu"
          class="inline-flex size-10 items-center justify-center rounded-default border border-border-card/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt"
        >
          <Icon icon="proicons:cancel" class="size-5" />
        </Dialog.Close>
      </div>
      <nav
        aria-label="Mobile navigation"
        class="flex flex-col border-t border-border-card/60 pt-3"
      >
        {#each navigationItems as item}
          <a
            class="flex items-center justify-between py-3 font-body text-(--text-body-lg) font-medium leading-(--leading-body-lg) text-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt"
            href={item.href}
          >
            <span>{item.label()}</span>
            <Icon icon="proicons:arrow-right" class="size-4" />
          </a>
        {/each}
      </nav>

      <div
        class="flex items-center justify-between gap-3 border-t border-border-card/60 pt-3"
      >
        <div class="flex flex-row items-center gap-2">
          <LanguageSelector side="right" align="end" />
          <DarkModeToggle class="inline-grid" />
        </div>
        <Button
          class="min-h-11 rounded-none px-6 text-body-md font-medium tracking-[-0.01em] text-nowrap"
          href="/get-started"
          variant="primary"
        >
          {m.nav_get_started()}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
