<script lang="ts">
import Icon from '@iconify/svelte'
import { onMount } from 'svelte'

import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setTheme,
} from '$lib/bits/internal/theme'
import { Swap } from '$lib/bits/components/swap'
import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  class?: string
}

let darkModeEnabled = $state(false)
let { class: className = '' }: Props = $props()

function handleThemeChange(nextValue: boolean) {
  darkModeEnabled = nextValue
  setTheme(nextValue ? 'dark' : 'light')
}

onMount(() => {
  darkModeEnabled = resolveTheme() === 'dark'
  applyTheme(darkModeEnabled ? 'dark' : 'light')

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const syncWithSystem = (event: MediaQueryListEvent) => {
    if (getStoredTheme()) {
      return
    }

    darkModeEnabled = event.matches
    applyTheme(event.matches ? 'dark' : 'light')
  }

  mediaQuery.addEventListener('change', syncWithSystem)

  return () => {
    mediaQuery.removeEventListener('change', syncWithSystem)
  }
})
</script>

<Swap
  aria-label={darkModeEnabled ? 'Switch to light theme' : 'Switch to dark theme'}
  bind:checked={darkModeEnabled}
  class={cn(
    'hidden size-11 rounded-default border border-border-card/70 bg-muted text-foreground transition-colors hover:bg-background-alt mobile:inline-grid',
    className
  )}
  onCheckedChange={handleThemeChange}
>
  {#snippet off()}
    <Icon icon="proicons:moon" class="size-4.5" />
  {/snippet}

  {#snippet on()}
    <Icon icon="proicons:brightness" class="size-4.5 text-secondary" />
  {/snippet}
</Swap>
