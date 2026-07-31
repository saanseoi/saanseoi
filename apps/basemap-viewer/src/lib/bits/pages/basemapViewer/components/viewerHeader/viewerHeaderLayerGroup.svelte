<script lang="ts">
export type LayerGroupItem = {
  checked: boolean
  disabled: boolean
  key: string
  label: string
}

let {
  items,
  label,
  onChange,
  separated = false,
}: {
  items: readonly LayerGroupItem[]
  label: string
  onChange: (key: string, enabled: boolean) => void
  separated?: boolean
} = $props()
</script>

<fieldset
  class={`grid min-w-0 gap-1 border-0 p-0 ${separated ? 'border-t border-(--bar-divider) pt-2' : 'pb-2'}`}
>
  <legend class="pb-[3px] text-[11px] font-bold tracking-[0.015em] text-(--bar-muted)">
    {label}
  </legend>
  {#each items as item}
    <label class="flex items-center gap-[7px] text-[13px] text-(--bar-text)">
      <input
        checked={item.checked}
        class="m-0 accent-(--bar-accent) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2"
        disabled={item.disabled}
        onchange={(event) => onChange(item.key, event.currentTarget.checked)}
        type="checkbox"
      >{item.label}
    </label>
  {/each}
</fieldset>
