<script lang="ts">
import type { ViewerDiagnostics } from '../../../../../../../diagnostics'
import type { Callbacks } from '../../../../../../ctx/app'
import type { ViewerText } from '../../../i18n'

let {
  callbacks,
  debug,
  text,
}: {
  callbacks: Callbacks
  debug: ViewerDiagnostics['debug']
  text: ViewerText
} = $props()

const items: readonly {
  key: keyof ViewerDiagnostics['debug']
  label: keyof ViewerText
}[] = [
  { key: 'tiles', label: 'tileBoundaries' },
  { key: 'collisions', label: 'collisionBoxes' },
  { key: 'overdraw', label: 'overdraw' },
]
</script>

<section class="grid gap-2 border-t border-(--bar-divider) pt-2">
  <h3 class="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-(--bar-muted)">
    {text.mapTools}
  </h3>
  <div class="grid grid-cols-2 gap-1.5 max-[420px]:grid-cols-1">
    {#each items as item}
      <label
        class="flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-2 py-1.5 leading-[1.2] transition-colors hover:bg-(--bar-hover-background)"
      >
        <input
          checked={debug[item.key]}
          onchange={(event) => callbacks.onDebug(item.key, event.currentTarget.checked)}
          type="checkbox"
        > <span>{text[item.label]}</span>
      </label>
    {/each}
  </div>
</section>
