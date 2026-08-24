<script lang="ts">
import type { ReleaseSampleField } from '../releaseSamplesPresentation'
import ReleaseSamplesNestedField from './releaseSamplesNestedField.svelte'

type Props = {
  depth?: number
  field: ReleaseSampleField
}

let { depth = 0, field }: Props = $props()
</script>

<div class="border-t border-outline-variant/55 first:border-t-0">
  <div
    class="grid min-w-0 grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 px-4 py-4"
  >
    <dt
      class:font-semibold={field.children?.length}
      class="min-w-0 font-mono text-label-md text-primary wrap-break-word"
      style:padding-left={`${depth * 1.25}rem`}
    >
      {field.key}
    </dt>
    <dd
      class="min-w-0 font-body text-body-md leading-6 text-foreground-alt wrap-break-word"
    >
      {#if field.value !== undefined}
        {field.value}
      {/if}
    </dd>
  </div>
  {#if field.children?.length}
    <dl class="bg-surface-container-low/60">
      {#each field.children as child (child.key)}
        <ReleaseSamplesNestedField field={child} depth={depth + 1} />
      {/each}
    </dl>
  {/if}
</div>
