<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { fade } from 'svelte/transition'

let visible = $state(false)
let reducedMotion = $state(false)
$effect(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const timer = setTimeout(() => {
    visible = true
  }, 200)
  return () => clearTimeout(timer)
})
</script>
{#if visible}
  <div
    in:fade={{ duration: reducedMotion ? 0 : 150 }}
    role="status"
    aria-label={m.source_audit_loading_applications()}
    class="space-y-3"
  >
    <span class="sr-only">{m.source_audit_loading_applications()}</span>
    <div aria-hidden="true" class="space-y-3 motion-safe:animate-pulse">
      <div class="h-3 w-24 rounded bg-current/10"></div>
      <div
        class="overflow-hidden rounded-xl border border-current/10 bg-current/[0.015]"
      >
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="space-y-2">
            <div class="h-5 w-28 rounded bg-current/10"></div>
            <div class="h-3 w-36 rounded bg-current/10"></div>
          </div>
          <div class="flex items-center gap-3">
            <div class="h-6 w-16 rounded-full bg-current/10"></div>
            <div class="size-4 rounded bg-current/10"></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 border-t border-current/10 px-4 py-3">
          {#each [0, 1] as side}
            <div class="min-w-0 space-y-3">
              <div class="h-4 w-28 max-w-full rounded bg-current/10"></div>
              <div class="h-5 w-20 max-w-full rounded bg-current/10"></div>
            </div>
          {/each}
        </div>
        <div class="border-t border-current/10 px-4 py-3">
          <div class="h-3 w-32 rounded bg-current/10"></div>
        </div>
      </div>
    </div>
  </div>
{/if}
