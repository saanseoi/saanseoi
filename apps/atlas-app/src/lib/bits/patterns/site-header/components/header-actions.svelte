<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { LanguageSelector } from '$lib/bits/components/language-selector'

import DarkModeToggle from './dark-mode-toggle.svelte'
import MobileMenu from './mobile-menu.svelte'
</script>

<div class="flex items-center justify-end gap-3 md:justify-self-end">
  <DarkModeToggle />

  <div class="hidden md:block">
    <LanguageSelector />
  </div>

  <Button
    class="hidden min-h-11 rounded-none px-6 text-[1rem] font-[500] tracking-[-0.01em] md:inline-flex"
    href="/get-started"
    variant="primary"
  >
    {m.nav_get_started()}
  </Button>

  <MobileMenu />
</div>
