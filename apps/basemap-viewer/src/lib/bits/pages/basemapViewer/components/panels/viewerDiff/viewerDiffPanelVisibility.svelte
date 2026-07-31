<script lang="ts">
import type { DiffSummary } from '../../../../../../diff'
import type { Callbacks } from '../../../../../../ctx/app'
import type { AppState } from '../../../../../../types'
import type { ViewerText } from '../../../i18n'
import { diffItems } from './viewerDiffPanel.constants'

let {
  callbacks,
  summary,
  text,
  visibility,
}: {
  callbacks: Callbacks
  summary: DiffSummary | null
  text: ViewerText
  visibility: AppState['diffVisibility']
} = $props()
</script>

<div class="grid grid-cols-2 gap-1.5">
  {#each diffItems as item}
    <button
      aria-pressed={visibility[item.key]}
      class={`flex cursor-pointer items-center gap-1.5 rounded-[5px] bg-(--bar-control-background) px-2 py-1.5 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 ${visibility[item.key] ? '' : 'opacity-40'}`}
      onclick={() => callbacks.onDiffVisibility(item.key, !visibility[item.key])}
      type="button"
    >
      <span class={`size-2.5 rounded-full ${item.colour}`} aria-hidden="true"></span>
      <span class={`${item.labelColour} truncate`}>{text[item.key]}</span>
      <strong class="ml-auto pl-1 font-semibold tabular-nums"
        >{summary?.[item.key] ?? 0}</strong
      >
    </button>
  {/each}
</div>
