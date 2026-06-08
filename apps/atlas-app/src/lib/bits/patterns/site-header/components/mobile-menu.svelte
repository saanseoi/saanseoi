<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { LanguageSelector } from '$lib/bits/components/language-selector'

import { navigationItems } from './navigation-items'

let mobileMenuOpen = $state(false)
</script>

<Dialog.Root bind:open={mobileMenuOpen}>
  <Dialog.Trigger
    aria-label="Open navigation menu"
    class="inline-flex size-11 items-center justify-center rounded-[var(--radius-default)] border border-border-card/70 bg-muted text-foreground transition-colors hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
  >
    <Icon icon="proicons:menu" class="size-5" />
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm md:hidden"
    />
    <Dialog.Content
      class="fixed right-5 top-5 z-50 flex w-[min(calc(100vw-2.5rem),22rem)] flex-col gap-6 rounded-lg border-2 border-foreground/90 bg-background-alt p-5 text-foreground shadow-popover focus:outline-none md:hidden"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <Dialog.Title
            class="font-display text-[var(--text-headline-md)] font-bold leading-[var(--leading-headline-md)] tracking-[var(--tracking-headline-lg)] text-foreground"
          >
            {m.nav_mobile_title()}
          </Dialog.Title>
          <Dialog.Description
            class="max-w-[18rem] font-body text-[var(--text-body-md)] leading-[var(--leading-body-md)] text-foreground-alt"
          >
            {m.nav_mobile_description()}
          </Dialog.Description>
        </div>

        <Dialog.Close
          aria-label="Close navigation menu"
          class="inline-flex size-10 items-center justify-center rounded-[var(--radius-default)] border border-border-card/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt"
        >
          <Icon icon="proicons:cancel" class="size-5" />
        </Dialog.Close>
      </div>

      <LanguageSelector />

      <nav
        aria-label="Mobile navigation"
        class="flex flex-col border-t border-border-card/60 pt-3"
      >
        {#each navigationItems as item}
          <a
            class="flex items-center justify-between py-3 font-body text-[var(--text-body-lg)] font-[500] leading-[var(--leading-body-lg)] text-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt"
            href={item.href}
          >
            <span>{item.label()}</span>
            <Icon icon="proicons:arrow-right" class="size-4" />
          </a>
        {/each}
      </nav>

      <Button href="/get-started" variant="primary">
        {m.nav_get_started()}
      </Button>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
