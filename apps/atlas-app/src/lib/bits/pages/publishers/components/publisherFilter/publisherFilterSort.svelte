<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { DropdownMenu } from 'bits-ui'

import type { PublisherSort, PublisherSortDirection } from './publisherFilterSort'

type Props = {
  value?: PublisherSort
  direction?: PublisherSortDirection
  class?: string
}

const options: Array<{ value: PublisherSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'apiRequests', label: 'API Requests' },
  { value: 'latestRelease', label: 'Latest Release' },
]

let {
  value = $bindable<PublisherSort>('name'),
  direction = $bindable<PublisherSortDirection>('ascending'),
  class: className = '',
}: Props = $props()
let selectedOption = $derived(options.find(option => option.value === value))
let selectedLabel = $derived(selectedOption?.label ?? 'Name')

const defaultDirection = (sort: PublisherSort): PublisherSortDirection =>
  sort === 'name' ? 'ascending' : 'descending'

const selectSort = (sort: PublisherSort) => {
  if (sort === value) {
    direction = direction === 'ascending' ? 'descending' : 'ascending'
    return
  }

  value = sort
  direction = defaultDirection(sort)
}
</script>

<div class={`relative block w-full sm:w-44 ${className}`}>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Sort sources"
      title={selectedLabel}
      class="grid h-10 w-full items-center gap-2 rounded-default border border-outline-variant/70 bg-background-alt/60 px-3 font-body text-label-md text-primary transition-colors hover:border-outline hover:bg-background-alt focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-secondary"
      style="grid-template-columns: auto minmax(0, 1fr) auto"
    >
      <Icon
        icon={direction === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down'}
        class="size-4 shrink-0 text-foreground-alt"
        aria-hidden="true"
      />
      <span
        class="text-left"
        style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        >{selectedLabel}</span
      >
      <Icon
        icon="ion:chevron-down-outline"
        class="size-4 shrink-0 text-foreground-alt"
        aria-hidden="true"
      />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="start"
        class="z-70 w-44 border border-outline-variant/70 bg-background-alt p-1 shadow-popover focus:outline-none"
        sideOffset={4}
      >
        {#each options as option}
          <DropdownMenu.Item
            class="flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2 font-body text-label-md text-primary outline-none hover:bg-surface-container-low focus:bg-surface-container-low"
            onSelect={() => selectSort(option.value)}
          >
            <span>{option.label}</span>
            {#if option.value === value}
              <Icon
                icon={direction === 'ascending' ? 'proicons:arrow-up' : 'proicons:arrow-down'}
                class="size-4 shrink-0 text-secondary"
                aria-hidden="true"
              />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>
