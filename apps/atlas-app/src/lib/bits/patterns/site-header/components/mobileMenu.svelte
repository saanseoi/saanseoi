<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { LanguageSelector } from '#lib/bits/components/language-selector/index.js'

import DarkModeToggle from './darkModeToggle.svelte'
import { navigationItems } from './navigationItems'

let mobileMenuOpen = $state(false)

type User = { email: string; image?: string | null; name: string }

let { user = null }: { user?: User | null } = $props()

const closeMobileMenu = () => {
  mobileMenuOpen = false
}
</script>

<Dialog.Root bind:open={mobileMenuOpen}>
  <button
    type="button"
    aria-expanded={mobileMenuOpen}
    aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
    class="inline-flex size-11 items-center justify-center rounded-default border border-border-card/70 bg-muted text-foreground transition-colors hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
    onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
  >
    <Icon icon={mobileMenuOpen ? 'proicons:cancel' : 'proicons:menu'} class="size-5" />
  </button>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-x-0 bottom-0 top-[calc(4.5rem-1px)] z-40 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-[mobile-menu-overlay-in_180ms_ease-out] data-[state=closed]:animate-[mobile-menu-overlay-out_140ms_ease-in_forwards] motion-reduce:animate-none md:hidden"
      onclick={closeMobileMenu}
    />
    <Dialog.Content
      trapFocus={false}
      preventScroll={false}
      onInteractOutside={event => event.preventDefault()}
      class="fixed inset-x-0 top-[calc(4.5rem-1px)] z-50 flex max-h-[calc(100svh-4.5rem+1px)] flex-col gap-5 overflow-y-auto border-b border-secondary/75 bg-background-alt p-5 text-foreground shadow-popover data-[state=open]:animate-[mobile-menu-content-in_280ms_cubic-bezier(0.2,0.7,0.2,1)] data-[state=closed]:animate-[mobile-menu-content-out_220ms_cubic-bezier(0.4,0,0.8,0.2)_forwards] focus:outline-none motion-reduce:animate-none md:hidden"
    >
      <div class="space-y-2">
        <Dialog.Description
          class="font-body text-(--text-body-md) leading-(--leading-body-md) text-foreground-alt"
        >
          {m.nav_mobile_description()}
        </Dialog.Description>
      </div>
      <nav
        aria-label="Mobile navigation"
        class="flex flex-col border-t border-border-card/60 pt-2"
      >
        {#each navigationItems as item}
          <a
            class="flex items-center justify-between py-2.5 font-body text-(--text-body-lg) font-medium leading-(--leading-body-lg) text-foreground transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt"
            href={item.href}
            onclick={closeMobileMenu}
          >
            <span>{item.label()}</span>
            <Icon icon="proicons:arrow-right" class="size-4" />
          </a>
        {/each}
      </nav>

      <div
        class="-mt-2 flex items-center justify-between gap-3 border-t border-border-card/60 pt-4"
      >
        <div class="flex flex-row items-center gap-2">
          <LanguageSelector side="right" align="end" />
          <DarkModeToggle class="inline-grid" />
        </div>
        {#if user}
          <Button
            class="min-h-11 rounded-default px-6 text-body-md font-medium text-nowrap"
            href="/api-keys"
            onclick={closeMobileMenu}
            variant="primary"
          >
            API keys
          </Button>
        {:else}
          <div class="flex items-center gap-3">
            <Button
              class="min-h-11 px-0 text-body-md font-medium text-nowrap"
              href="/sign-in"
              onclick={closeMobileMenu}
              variant="text"
            >
              {m.auth_sign_in_title()}
            </Button>
            <span aria-hidden="true" class="h-5 w-px bg-border-card/70"></span>
            <Button
              class="min-h-11 px-4 text-body-md font-medium text-nowrap"
              href="/sign-up"
              onclick={closeMobileMenu}
              variant="primary"
            >
              {m.nav_sign_up()}
            </Button>
          </div>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
@keyframes -global-mobile-menu-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes -global-mobile-menu-overlay-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes -global-mobile-menu-content-in {
  from {
    opacity: 0;
    transform: translateY(-1.25rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes -global-mobile-menu-content-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-1rem);
  }
}
</style>
