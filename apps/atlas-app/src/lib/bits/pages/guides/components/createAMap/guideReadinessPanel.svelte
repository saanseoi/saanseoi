<script lang="ts">
import { tick, type Snippet } from 'svelte'

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
let panelElement = $state<HTMLElement>()
let previousComplete = $state<boolean>()

const scrollToPanelTop = async () => {
  await tick()
  requestAnimationFrame(() => {
    const panel = panelElement
    if (!panel) return

    const headerHeight =
      document.querySelector('header')?.getBoundingClientRect().height ?? 72
    window.scrollTo({
      top: Math.max(
        0,
        window.scrollY + panel.getBoundingClientRect().top - headerHeight - 16,
      ),
    })
  })
}

$effect(() => {
  const hasJustCompleted = previousComplete === false && complete
  previousComplete = complete

  if (hasJustCompleted) void scrollToPanelTop()
})

const toggleExpanded = () => {
  expanded = !expanded
  onExpandedChange?.(expanded)
}
</script>

<aside
  bind:this={panelElement}
  {id}
  class={`mt-4 mb-8 max-w-3xl border-l-4 pr-5 pl-6.5 py-5 ${complete ? 'border-secondary bg-secondary/5 dark:border-[#6fdec9] dark:bg-[#6fdec9]/12' : 'border-[#b42318] bg-[#fff4f2] dark:border-[#ef8b88] dark:bg-[#ef8b88]/12'}`}
  aria-labelledby={titleId}
>
  {#if children}
    {@render children()}
  {:else if complete && completeSummary}
    <button
      class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
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
      class={complete ? 'mt-5 border-t border-secondary/35 pt-5 dark:border-[#6fdec9]/35' : 'mt-4'}
    >
      {@render details()}
    </div>
  {/if}
</aside>
