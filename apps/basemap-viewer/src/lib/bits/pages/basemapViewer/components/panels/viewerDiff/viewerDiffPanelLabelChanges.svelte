<script lang="ts">
import type { DiffLabelChange } from '../../../../../../diff'
import type { Callbacks } from '../../../../../../ctx/app'
import type { ViewerText } from '../../../i18n'
import { diffMarkerColours } from './viewerDiffPanel.constants'

let {
  callbacks,
  changes,
  text,
}: {
  callbacks: Callbacks
  changes: DiffLabelChange[]
  text: ViewerText
} = $props()
</script>

<div
  class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 border-t border-(--bar-divider) pt-2"
>
  <strong class="text-[11px] text-(--bar-muted)">{text.labelChanges}</strong>
  <div class="grid min-h-0 content-start gap-1 overflow-y-auto pr-1">
    {#each changes as change}
      <button
        class="flex min-w-0 cursor-pointer items-center gap-2 rounded-[4px] px-1 py-0.5 text-left even:bg-(--bar-control-background) hover:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-1"
        onclick={() => callbacks.onDiffLabel(change)}
        title={change.label}
        type="button"
      >
        <span
          class={`size-2 shrink-0 rounded-full ${diffMarkerColours[change.status]}`}
          aria-hidden="true"
        ></span>
        <span class="truncate">{change.label}</span>
      </button>
    {/each}
  </div>
</div>
