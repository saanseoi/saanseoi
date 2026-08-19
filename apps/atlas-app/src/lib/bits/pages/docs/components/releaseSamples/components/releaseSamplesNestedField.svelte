<script lang="ts">
import type { ReleaseSampleField } from '../releaseSamplesPresentation'
import ReleaseSamplesNestedField from './releaseSamplesNestedField.svelte'

type Props = {
  depth?: number
  field: ReleaseSampleField
}

let { depth = 0, field }: Props = $props()
</script>

<div class="border-t border-data-outline-variant/50 first:border-t-0">
  <div class="grid min-w-0 grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-5 px-4 py-3">
    <dt
      class:font-semibold={field.children?.length}
      class="min-w-0 font-mono text-label-sm text-foreground-alt wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      {field.key}
    </dt>
    <dd class="min-w-0 font-body text-body-md leading-6 text-primary wrap-break-word">
      {#if field.value !== undefined}
        {field.value}
      {/if}
    </dd>
  </div>
  {#if field.children?.length}
    <dl class="bg-data-surface-container-low/40">
      {#each field.children as child (child.key)}
        <ReleaseSamplesNestedField field={child} depth={depth + 1} />
      {/each}
    </dl>
  {/if}
</div>
