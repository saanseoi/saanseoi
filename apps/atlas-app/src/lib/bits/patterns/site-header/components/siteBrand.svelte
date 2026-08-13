<script lang="ts">
import { dev } from '$app/environment'
import { env } from '$env/dynamic/public'

const environmentLabel = dev
  ? 'DEV'
  : env.PUBLIC_ATLAS_API_BASE_URL === 'https://preview.api.saanseoi.hk'
    ? 'PREVIEW'
    : null
</script>

<a
  aria-label="SaanSeoi home"
  class="relative inline-flex items-center gap-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  href="/"
>
  <span
    class="font-display text-[1.85rem] font-black leading-none tracking-tighter text-nowrap"
    >山水</span
  >
  <span class="h-8 w-px bg-border-card"></span>
  <span
    class="relative font-display text-[1.9rem] font-black leading-none tracking-display-md text-nowrap"
  >
    SaanSeoi
    {#if environmentLabel}
      <span
        class="pointer-events-none absolute bottom-full left-full ml-1 font-mono text-[10px] leading-none tracking-[0.08em] text-secondary"
        >{environmentLabel}</span
      >
    {/if}
  </span>
</a>
