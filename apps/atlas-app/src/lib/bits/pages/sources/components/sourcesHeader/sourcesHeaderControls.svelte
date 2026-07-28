<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { Label } from '$lib/bits/primitives/label'

type Props = {
  expandAll?: boolean
  showPlanned?: boolean
}

let { expandAll = $bindable(false), showPlanned = $bindable(true) }: Props = $props()
</script>

<div class="flex flex-wrap items-center gap-3">
  <div class="flex items-center gap-2">
    <input
      id="sources-show-planned"
      bind:checked={showPlanned}
      class="size-4 accent-secondary"
      type="checkbox"
    >
    <Label class="cursor-pointer text-label-md text-primary" for="sources-show-planned">
      {m.sources_show_planned()}
    </Label>
  </div>
  <Button
    class="border-outline-variant text-primary hover:border-secondary hover:text-secondary"
    size="compact"
    type="button"
    variant="secondary"
    onclick={() => (expandAll = !expandAll)}
  >
    {expandAll ? m.sources_collapse_all() : m.sources_expand_all()}
  </Button>
</div>
