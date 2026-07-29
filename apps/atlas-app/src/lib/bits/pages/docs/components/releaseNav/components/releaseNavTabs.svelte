<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
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
        class={`h-full border-b-2 px-1 font-body text-label-md font-semibold transition ${activeTab === id ? 'border-secondary text-primary' : 'border-transparent text-foreground-alt hover:text-primary'}`}
        type="button"
        role="tab"
        aria-selected={activeTab === id}
        onclick={() => onSelect(id)}
      >
        <span class="lg:hidden">{compactLabel ?? label}</span
        ><span class="hidden lg:inline">{label}</span>
      </button>
    {/each}
  </div>
</div>
