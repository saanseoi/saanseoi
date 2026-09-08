<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
let {
  resources,
  selected = $bindable(''),
}: {
  resources: { id: string; resourceType: string; status: string }[]
  selected?: string
} = $props()
</script>

<label class="mb-6 flex flex-wrap items-center gap-3 text-sm">
  {m.source_resource_type()}
  <select
    class="rounded border border-current/20 bg-background px-3 py-2"
    bind:value={selected}
  >
    {#each resources as resource (resource.id)}
      <option value={resource.id}>
        {resourceLabel(resource.resourceType)}
        · {resource.status}
      </option>
    {/each}
  </select>
</label>
