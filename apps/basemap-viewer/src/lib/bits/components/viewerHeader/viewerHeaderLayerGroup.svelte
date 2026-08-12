<script lang="ts">
import type { ViewerLayerItem } from '../../pages/basemapViewer/controlOptions'

let {
  class: className = '',
  items,
  label,
  onChange,
  separated = false,
}: {
  class?: string
  items: readonly ViewerLayerItem[]
  label: string
  onChange: (key: string, enabled: boolean) => void
  separated?: boolean
} = $props()
</script>

<fieldset
  class={`grid content-start min-w-0 gap-1.5 border-0 p-0 ${separated ? 'pt-2' : 'pb-0'} ${className}`}
>
  <legend
    class="pb-2 font-mono text-[10px] font-semibold tracking-[0.06em] text-(--bar-muted) uppercase"
  >
    {label}
  </legend>
  {#each items as item}
    <label
      class={`flex h-5 items-center gap-2 whitespace-nowrap text-[13px] text-(--bar-text) ${item.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
    >
      <input
        checked={item.checked}
        class={`m-0 size-5 accent-(--bar-accent) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 ${item.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        disabled={item.disabled}
        onchange={(event) => onChange(item.key, event.currentTarget.checked)}
        type="checkbox"
      >{item.label}
    </label>
  {/each}
</fieldset>
