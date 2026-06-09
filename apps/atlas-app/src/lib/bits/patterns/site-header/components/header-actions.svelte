<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import { CtaButton } from '$lib/bits/primitives/button'
import { LanguageSelector } from '$lib/bits/components/language-selector'

import DarkModeToggle from './dark-mode-toggle.svelte'
import MobileMenu from './mobile-menu.svelte'
</script>

<div class="flex items-center justify-end gap-3 flex-row mobile:justify-self-end">
  <div class="hidden items-center gap-3 flex-row mobile:flex">
    <DarkModeToggle />
    <LanguageSelector />
    <CtaButton href="/get-started" text={m.nav_get_started()} />
  </div>

  <MobileMenu />
</div>
