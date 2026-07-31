<script lang="ts">
import type { Callbacks } from '../../../../../ctx/app'
import type { AppState } from '../../../../../types'
import type { ViewerText } from '../../i18n'

let {
  callbacks,
  mode,
  text,
}: {
  callbacks: Callbacks
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
  { value: 'diff', label: 'diff' },
]

const buttonClass =
  'inline-flex h-full items-center px-1.5 font-mono text-[10px] leading-none font-semibold tracking-[0.02em] text-(--bar-text) uppercase aria-pressed:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-[-2px]'
</script>

<fieldset
  aria-label={text.comparisonView}
  class="m-0 flex h-[28px] shrink-0 self-center overflow-hidden rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) p-0"
>
  {#each modes as item, index}
    <button
      aria-pressed={mode === item.value}
      class={`${index ? 'border-l border-(--bar-border) ' : ''}${buttonClass}`}
      onclick={() => callbacks.onComparisonMode(item.value)}
      type="button"
    >
      {text[item.label]}
    </button>
  {/each}
</fieldset>
