<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'
import { Label } from '#lib/bits/primitives/label/index.js'
import SourcesHeaderSearch from './sourcesHeaderSearch.svelte'

type Props = {
  expandAll?: boolean
  showPlanned?: boolean
  sourceSearch?: string
}

let {
  expandAll = $bindable(false),
  showPlanned = $bindable(true),
  sourceSearch = $bindable(''),
}: Props = $props()
</script>

<div class="flex w-full flex-wrap items-center justify-between gap-3">
  <SourcesHeaderSearch bind:query={sourceSearch} />
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-2">
      <input
        id="sources-show-planned"
        bind:checked={showPlanned}
        class="size-4 accent-secondary"
        type="checkbox"
      >
      <Label
        class="cursor-pointer text-label-md text-primary"
        for="sources-show-planned"
      >
        {m.sources_show_planned()}
      </Label>
    </div>
    <Button
      class="w-34 border-outline-variant text-primary hover:border-secondary hover:text-secondary"
      size="compact"
      type="button"
      variant="secondary"
      onclick={() => (expandAll = !expandAll)}
    >
      <Icon
        icon={expandAll
            ? 'material-symbols-light:fullscreen-exit'
            : 'material-symbols-light:fullscreen'}
        class="size-4"
        aria-hidden="true"
      />
      {expandAll ? m.sources_collapse_all() : m.sources_expand_all()}
    </Button>
  </div>
</div>
