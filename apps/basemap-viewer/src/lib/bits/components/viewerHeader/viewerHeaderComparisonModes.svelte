<script lang="ts">
import type { Callbacks } from '../../../ctx/app'
import type { AppState } from '../../../types'
import type { ViewerText } from '../../pages/basemapViewer/i18n'

let {
  callbacks,
  class: className = '',
  mode,
  text,
}: {
  callbacks: Callbacks
  class?: string
  mode: AppState['comparisonMode']
  text: ViewerText
} = $props()

const modes: readonly {
  value: AppState['comparisonMode']
  label: keyof ViewerText
}[] = [
  { value: 'split', label: 'split' },
  { value: 'overlay', label: 'overlay' },
  { value: 'side-by-side', label: 'sideBySide' },
  { value: 'labels', label: 'labels' },
]

const buttonClass =
  'relative inline-flex h-full flex-1 cursor-pointer items-center justify-center border-y border-transparent px-1.5 font-mono text-[10px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap text-(--bar-text) uppercase transition-[background-color] duration-150 hover:z-1 hover:bg-(--bar-hover-background) hover:outline hover:outline-1 hover:outline-(--bar-hover-border) aria-pressed:bg-(--bar-active-background) aria-pressed:hover:bg-(--bar-active-background) focus-visible:z-1 focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:-outline-offset-2'
</script>

<fieldset
  aria-label={text.comparisonView}
  class={`m-0 flex h-[28px] shrink-0 self-center overflow-visible rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) p-0 ${className}`}
>
  {#each modes as item, index}
    <button
      aria-pressed={mode === item.value}
      class={`${index ? 'border-l border-(--bar-border) ' : 'rounded-l-[4px] '}${index === modes.length - 1 ? 'rounded-r-[4px] ' : ''}${buttonClass}`}
      onclick={() =>
        mode === item.value
          ? callbacks.onComparisonVersion(null)
          : callbacks.onComparisonMode(item.value)}
      type="button"
    >
      {text[item.label]}
    </button>
  {/each}
</fieldset>
