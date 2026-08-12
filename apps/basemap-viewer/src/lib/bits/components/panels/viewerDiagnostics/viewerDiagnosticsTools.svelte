<script lang="ts">
import type { ViewerDiagnostics } from '../../../../../diagnostics'
import type { Callbacks } from '../../../../ctx/app'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'

let {
  callbacks,
  debug,
  mobile = false,
  separated = true,
  showTitle = true,
  text,
  title = text.mapTools,
}: {
  callbacks: Callbacks
  debug: ViewerDiagnostics['debug']
  mobile?: boolean
  separated?: boolean
  showTitle?: boolean
  text: ViewerText
  title?: string
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

<section
  class={`grid gap-2 ${separated ? 'border-t border-(--bar-divider) pt-2' : ''}`}
>
  {#if showTitle}
    <h3
      class="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-(--bar-muted)"
    >
      {title}
    </h3>
  {/if}
  <div class={`grid grid-cols-2 gap-1.5 ${mobile ? '' : 'max-[420px]:grid-cols-1'}`}>
    {#each items as item}
      <label
        class={`flex cursor-pointer items-center rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) leading-[1.2] transition-colors hover:border-(--bar-hover-border) hover:bg-(--bar-hover-background) ${mobile ? 'h-11 gap-3 px-3 font-mono text-[12px] font-semibold' : 'gap-1.5 px-2 py-1.5'}`}
      >
        <input
          checked={debug[item.key]}
          class={mobile ? 'm-0 size-5 accent-(--bar-accent)' : 'm-0'}
          onchange={(event) => callbacks.onDebug(item.key, event.currentTarget.checked)}
          type="checkbox"
        > <span>{text[item.label]}</span>
      </label>
    {/each}
  </div>
</section>
