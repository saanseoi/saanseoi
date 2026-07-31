<script lang="ts">
import Icon from '@iconify/svelte'
import { goto } from '$app/navigation'

import type { ReleaseHeaderDomainOption } from '../releaseHeaderDomainOptions'

type DomainOption = ReleaseHeaderDomainOption & { label: string }

type Props = {
  currentDomainCode: string
  label: string
  options: DomainOption[]
}

let { currentDomainCode, label, options }: Props = $props()
let currentOption = $derived(
  options.find(option => option.code === currentDomainCode) ?? options[0],
)
function selectDomain(event: Event) {
  const domainCode = (event.currentTarget as HTMLSelectElement).value
  const target = options.find(option => option.code === domainCode)
  if (target && target.code !== currentDomainCode) void goto(target.href)
}
</script>

{#if options.length > 1 && currentOption}
  <div class="relative max-w-full">
    <select
      class="w-fit max-w-full cursor-pointer appearance-none bg-transparent pr-5 font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary outline-none transition-colors hover:text-primary focus-visible:text-primary"
      aria-label={label}
      value={currentDomainCode}
      onchange={selectDomain}
    >
      {#each options as option}
        <option value={option.code}>{option.label}</option>
      {/each}
    </select>
    <Icon
      icon="ion:chevron-down-outline"
      class="pointer-events-none absolute right-0 top-1/2 size-3.5 -translate-y-1/2 text-secondary"
      aria-hidden="true"
    />
  </div>
{:else if currentOption}
  <span
    class="block truncate font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
  >
    {currentOption.label}
  </span>
{/if}
