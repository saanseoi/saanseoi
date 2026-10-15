<script lang="ts">
import { onMount } from 'svelte'
let dark = $state(true)
onMount(() => {
  dark = document.documentElement.classList.contains('dark')
})
function toggle() {
  dark = !dark
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('ingestion-review-theme', dark ? 'dark' : 'light')
  } catch {
    /* Keep the toggle available when storage is disabled. */
  }
}
</script>

<button
  type="button"
  class="rounded border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm text-foreground hover:bg-surface-container"
  aria-pressed={dark}
  aria-label="Dark mode"
  onclick={toggle}
>
  {dark ? 'Switch to light mode' : 'Switch to dark mode'}
</button>
