<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { authClient } from '#lib/auth-client.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { LanguageSelector } from '#lib/bits/components/language-selector/index.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { DropdownMenu } from 'bits-ui'

import DarkModeToggle from './darkModeToggle.svelte'
import MobileMenu from './mobileMenu.svelte'

type User = {
  email: string
  image?: string | null
  name: string
}

let { user = null }: { user?: User | null } = $props()

const initials = $derived(
  (user?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '',
)

const handleSignOut = async () => {
  const { error } = await authClient.signOut()
  if (error) return
  window.location.assign('/')
}
</script>

<div class="flex items-center justify-end gap-4 flex-row md:justify-self-end">
  <div class="hidden items-center flex-row md:flex">
    <div class="flex gap-4 flex-row">
      <DarkModeToggle />
      <LanguageSelector />
      {#if user}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Open account menu"
            class="inline-flex size-11 items-center justify-center overflow-hidden rounded-full border border-border-card bg-surface-container-low font-body text-sm font-semibold text-foreground transition-colors hover:bg-surface-container"
          >
            {#if user.image}
              <img alt="" class="size-full object-cover" src={user.image}>
            {:else}
              {initials}
            {/if}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              class="z-70 w-56 border border-border-card bg-background-alt p-1 shadow-popover focus:outline-none"
              onOpenAutoFocus={event => event.preventDefault()}
              preventScroll={false}
            >
              <div class="border-b border-border-card px-3 py-2">
                <p class="truncate font-body text-sm font-semibold text-foreground">
                  {user.name}
                </p>
                <p class="truncate font-body text-xs text-foreground-alt">
                  {user.email}
                </p>
              </div>
              <a
                class="mt-1 flex items-center gap-2 px-3 py-2 font-body text-sm text-foreground outline-none hover:bg-surface-container-low focus:bg-surface-container-low"
                href="/api-keys"
                ><Icon icon="proicons:key" class="size-4" />API keys</a
              >
              <a
                class="flex items-center gap-2 px-3 py-2 font-body text-sm text-foreground outline-none hover:bg-surface-container-low focus:bg-surface-container-low"
                href="/account"
                ><Icon icon="proicons:settings" class="size-4" />Account settings</a
              >
              <div class="my-1 border-t border-border-card"></div>
              <button
                class="flex w-full items-center gap-2 px-3 py-2 font-body text-sm text-foreground outline-none hover:bg-surface-container-low focus:bg-surface-container-low"
                onclick={handleSignOut}
                type="button"
              >
                <Icon icon="proicons:sign-out" class="size-4" />Sign out
              </button>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      {/if}
    </div>
    {#if !user}
      <div class="flex items-center gap-0">
        <Button
          class="min-h-11 rounded-none px-0 text-body-md font-medium tracking-[-0.01em] text-nowrap"
          href="/sign-in"
          variant="text"
        >
          {m.auth_sign_in_title()}
        </Button>
        <Button
          class="min-h-11 rounded-none px-6 text-body-md font-medium tracking-[-0.01em] text-nowrap"
          href="/sign-up"
          variant="primary"
        >
          {m.nav_sign_up()}
        </Button>
      </div>
    {/if}
  </div>

  <MobileMenu {user} />
</div>
