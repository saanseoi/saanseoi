<script lang="ts">
import { Icon } from '../../primitives/icon'
import type { ViewerText } from '../../pages/basemapViewer/i18n'

let {
  active,
  dirty,
  menuOpen,
  onMenu,
  onPanel,
  panelOpen,
  text,
  theme,
}: {
  active: 'diff' | 'diagnostics' | 'inspection' | null
  dirty: boolean
  menuOpen: boolean
  onMenu: () => void
  onPanel: (panel: 'diff' | 'diagnostics' | 'inspection') => void
  panelOpen: boolean
  text: ViewerText
  theme: string
} = $props()

const panel = $derived(
  active === 'diff'
    ? { icon: 'layers' as const, label: text.labels }
    : active === 'diagnostics'
      ? { icon: 'debug' as const, label: text.diagnostics }
      : active === 'inspection'
        ? { icon: 'identify' as const, label: text.identifyButton }
        : null,
)
const lightTheme = $derived(theme === 'light')
</script>

<nav
  aria-label={text.mapControls}
  class={`mobile-layout fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border p-1 shadow-[0_8px_24px_var(--bar-shadow)] ${lightTheme ? 'border-[#bdc7cd] bg-white text-[#1e292f]' : 'border-[#3b4448] bg-black text-white'}`}
  data-bar-theme={theme}
>
  {#if menuOpen}
    <button
      class={`h-10 cursor-pointer rounded-full px-4 text-[11px] font-bold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-(--bar-accent) ${dirty ? (lightTheme ? 'bg-(--bar-active-background) text-(--bar-text) hover:text-[#0b1b21]' : 'bg-(--bar-active-background) text-(--bar-text) hover:text-white') : (lightTheme ? 'text-[#1e292f] hover:text-(--bar-accent)' : 'text-white hover:text-(--bar-accent)')}`}
      onclick={onMenu}
      type="button"
    >
      {dirty ? text.applyChanges : text.close}
    </button>
  {:else}
    <button
      aria-label={text.mapControls}
      class={`grid size-10 cursor-pointer place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-(--bar-accent) ${lightTheme ? 'text-[#1e292f] hover:bg-black/5' : 'text-white hover:bg-white/10'}`}
      onclick={onMenu}
      type="button"
    >
      <Icon class="size-5" name="menu" />
    </button>
  {/if}
  {#if !menuOpen && panel && active}
    <button
      aria-pressed={panelOpen}
      class={`flex h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-[11px] font-bold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-(--bar-accent) ${panelOpen ? (lightTheme ? 'bg-black/5 text-[#1e292f]' : 'bg-white/10 text-white') : (lightTheme ? 'text-[#1e292f]/45 hover:bg-black/10' : 'text-white/45 hover:bg-white/10')}`}
      onclick={() => onPanel(active)}
      type="button"
    >
      <Icon class="size-4" name={panel.icon} />
      {panel.label}
    </button>
  {/if}
</nav>
