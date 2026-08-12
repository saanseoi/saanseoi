<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  complete: boolean
  completeSummary?: Snippet
  details?: Snippet
  expanded?: boolean
  id: string
  incompleteSummary?: Snippet
  onExpandedChange?: (expanded: boolean) => void
  titleId: string
}

let {
  children,
  complete,
  completeSummary,
  details,
  expanded = $bindable(false),
  id,
  incompleteSummary,
  onExpandedChange,
  titleId,
}: Props = $props()

const toggleExpanded = () => {
  expanded = !expanded
  onExpandedChange?.(expanded)
}
</script>

<aside
  {id}
  class={`-mt-4 mb-12 max-w-3xl border-l-4 px-5 py-5 ${complete ? 'border-[#6fdec9] bg-[#6fdec9]/12' : 'border-[#ef8b88] bg-[#ef8b88]/12'}`}
  aria-labelledby={titleId}
>
  {#if children}
    {@render children()}
  {:else if complete && completeSummary}
    <button
      class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6fdec9]"
      type="button"
      aria-controls={`${id}-details`}
      aria-expanded={expanded}
      onclick={toggleExpanded}
    >
      {@render completeSummary()}
    </button>
  {:else if incompleteSummary}
    {@render incompleteSummary()}
  {/if}

  {#if details && (!complete || expanded)}
    <div
      id={`${id}-details`}
      class={`ml-8 ${complete ? 'mt-5 border-t border-[#6fdec9]/35 pt-5' : 'mt-4'}`}
    >
      {@render details()}
    </div>
  {/if}
</aside>
