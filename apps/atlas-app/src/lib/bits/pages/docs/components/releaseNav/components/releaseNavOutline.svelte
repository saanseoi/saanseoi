<script lang="ts">
import type { ReleaseNavOutlineItem } from '../releaseNav.types'
import { scrollToReleaseNavAnchor } from '../releaseNavScroll'
import ReleaseNavInlineLabel from './releaseNavInlineLabel.svelte'

type OutlineNode = ReleaseNavOutlineItem & { children: OutlineNode[] }
type StemState = 'inactive' | 'active' | 'active-end'
type Props = {
  activeId: string | null
  ariaLabel: string
  items: ReleaseNavOutlineItem[]
  mobile?: boolean
  onSelect?: () => void
  panel?: HTMLElement
}

let { activeId, ariaLabel, items, mobile = false, onSelect, panel }: Props = $props()

const buildTree = (items: ReleaseNavOutlineItem[]) => {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const item of items) {
    const node: OutlineNode = { ...item, children: [] }
    const depth = node.depth ?? 2
    while (stack.length && (stack.at(-1)?.depth ?? 2) >= depth) stack.pop()
    const parent = stack.at(-1)
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

const containsActive = (node: OutlineNode): boolean =>
  node.id === activeId || node.children.some(containsActive)

let tree = $derived(buildTree(items))
</script>

<nav
  class={mobile ? 'px-3 py-2' : 'px-2 pb-3 pt-2 text-primary'}
  aria-label={ariaLabel}
>
  {#snippet item(
    node: OutlineNode,
    nested: boolean,
    isLast: boolean,
    stem: StemState = 'inactive',
  )}
    {@const active = activeId === node.id}
    {@const onActivePath = containsActive(node)}
    <li class:ml-2={nested} class:pl-3={nested} class="relative">
      {#if nested}
        <span
          class={`pointer-events-none absolute -top-0.75 left-0 border-l transition-colors ${stem === 'inactive' ? 'border-outline-variant/80' : 'border-secondary'} ${stem === 'active-end' || isLast ? mobile ? 'h-5.5' : 'h-4' : '-bottom-0.75'}`}
          aria-hidden="true"
        ></span>
        <span
          class={`pointer-events-none absolute left-0 border-t transition-colors ${mobile ? 'top-5 w-3' : 'top-3.5 w-3'} ${onActivePath ? 'border-secondary' : 'border-outline-variant/80'}`}
          aria-hidden="true"
        ></span>
      {/if}
      <a
        class={`relative z-10 flex items-center rounded-md px-2 font-body leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-secondary ${mobile ? 'min-h-10 py-1.5 text-label-md' : 'min-h-7 py-1 text-label-sm'} ${active ? 'bg-secondary-container text-foreground-alt dark:text-[#edf2ee]!' : 'text-foreground-alt hover:bg-black/5 hover:text-primary dark:hover:bg-white/10'}`}
        href={node.href ?? `#${node.id}`}
        onclick={event => {
          scrollToReleaseNavAnchor({ event, id: node.id, items, mobile, panel })
          onSelect?.()
        }}
        aria-current={active ? 'location' : undefined}
        ><ReleaseNavInlineLabel label={node.label} /></a
      >
      {#if node.children.length}
        {@const activeChildIndex = node.children.findIndex(containsActive)}
        <ol class="space-y-1 pt-1">
          {#each node.children as child, index}
            {@render item(
              child,
              true,
              index === node.children.length - 1,
              activeChildIndex < 0 || index > activeChildIndex
                ? 'inactive'
                : index === activeChildIndex
                  ? 'active-end'
                  : 'active',
            )}
          {/each}
        </ol>
      {/if}
    </li>
  {/snippet}
  <ol class="space-y-1">
    {#each tree as node, index}
      {@render item(node, false, index === tree.length - 1)}
    {/each}
  </ol>
</nav>
