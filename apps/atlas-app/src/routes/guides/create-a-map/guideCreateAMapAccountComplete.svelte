<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  user: {
    image: string | null
    name: string
  }
}

let { user }: Props = $props()
let initials = $derived(
  user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join(''),
)
</script>

<section
  aria-labelledby="guide-basemap-account-complete-title"
  class="mt-8 min-w-0 max-w-3xl border-l-4 border-[#149b75] bg-[#e2f5ed] px-5 py-5 dark:border-[#6fdec9] dark:bg-[#6fdec9]/12"
>
  <div class="flex min-w-0 items-center justify-between gap-4">
    <div class="flex min-w-0 flex-1 items-center gap-4">
      <div
        class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#149b75]/45 bg-surface-container-low font-body text-sm font-semibold text-primary dark:border-[#6fdec9]/45"
      >
        {#if user.image}
          <img alt="" class="size-full object-cover" src={user.image}>
        {:else}
          {initials}
        {/if}
      </div>
      <div class="min-w-0">
        <p
          class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#08745b] uppercase dark:text-[#6fdec9]"
        >
          {m.guide_basemap_account_complete_eyebrow()}
        </p>
        <h3
          id="guide-basemap-account-complete-title"
          class="mt-1 truncate font-body text-body-lg font-semibold text-primary"
        >
          {m.guide_basemap_account_complete_title().replace('{name}', user.name)}
        </h3>
      </div>
    </div>
    <div
      aria-label={m.guide_basemap_account_complete()}
      class="shrink-0 text-[#08745b] dark:text-[#6fdec9]"
      role="img"
    >
      <Icon icon="ion:checkmark-circle" class="size-5" aria-hidden="true" />
    </div>
  </div>
</section>
