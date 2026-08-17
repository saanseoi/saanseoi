<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { prefersReducedMotion } from 'svelte/motion'
import { flip } from 'svelte/animate'
import type { ReleaseNavTab } from '../releaseNav.types'

type Props = {
  activeTab: string
  onSelect: (tab: string) => void
  tabs: ReleaseNavTab[]
}

let { activeTab, onSelect, tabs }: Props = $props()
</script>

<div class="flex h-10 min-w-0 justify-start">
  <div
    class="flex min-w-0 flex-1 gap-5 overflow-x-auto"
    role="tablist"
    aria-label={m.source_tab_information()}
  >
    {#each tabs as { id, compactLabel, label } (id)}
      <button
        animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
        class={`h-full cursor-pointer border-b-2 px-1 font-body text-label-md font-semibold transition hover:text-white ${activeTab === id ? 'border-secondary text-primary' : 'border-transparent text-foreground-alt'}`}
        type="button"
        role="tab"
        aria-selected={activeTab === id}
        onclick={() => onSelect(id)}
      >
        <span class="xl:hidden">{compactLabel ?? label}</span
        ><span class="hidden xl:inline">{label}</span>
      </button>
    {/each}
  </div>
</div>
