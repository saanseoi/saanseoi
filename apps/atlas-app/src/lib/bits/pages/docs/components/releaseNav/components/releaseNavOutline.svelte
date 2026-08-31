<script lang="ts">
import type { ReleaseNavOutlineItem } from '../releaseNav.types'
import { scrollToReleaseNavAnchor } from '../releaseNavScroll'
import ReleaseNavInlineLabel from './releaseNavInlineLabel.svelte'

type OutlineNode = ReleaseNavOutlineItem & { children: OutlineNode[] }
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

let tree = $derived(buildTree(items))
const indent = (depth: number) => `${0.5 + Math.max(0, depth - 2) * 0.5}rem`
</script>

<nav
  class={mobile ? 'px-3 py-3' : 'px-2 pb-4 pt-3 text-primary'}
  aria-label={ariaLabel}
>
  {#snippet item(node: OutlineNode, isLast: boolean)}
    {@const depth = node.depth ?? 2}
    <div
      class:ml-4={!mobile && depth === 3}
      class:ml-6={mobile ? depth >= 3 : depth >= 4}
      class="relative"
    >
      {#if depth >= 3}
        <span
          class={`pointer-events-none absolute top-0 left-0 border-l border-outline-variant ${isLast ? mobile ? 'h-[18px]' : 'h-1/2' : 'bottom-0'}`}
          aria-hidden="true"
        ></span>
      {/if}
      <a
        class={`relative z-10 block rounded-md font-body leading-5 transition hover:bg-black/5 dark:hover:bg-white/10 ${mobile ? 'px-2 py-2 text-label-md' : 'py-1.5 text-label-sm'} ${activeId === node.id ? 'bg-secondary-container font-semibold text-foreground-alt dark:text-[#edf2ee]! hover:text-secondary!' : 'text-foreground-alt'}`}
        class:px-2={!mobile && depth === 2}
        class:pl-3={!mobile && depth !== 2}
        class:pr-2={!mobile && depth !== 2}
        class:ml-[12px]={!mobile && depth >= 3}
        class:mr-2={!mobile && depth >= 3}
        style:padding-left={mobile ? indent(depth) : undefined}
        href={node.href ?? `#${node.id}`}
        onclick={event => {
          scrollToReleaseNavAnchor({ event, id: node.id, items, mobile, panel })
          onSelect?.()
        }}
        aria-current={activeId === node.id ? 'location' : undefined}
        ><ReleaseNavInlineLabel label={node.label} /></a
      >
      {#each node.children as child, index}
        {@render item(child, index === node.children.length - 1)}
      {/each}
    </div>
  {/snippet}
  {#each tree as node, index}
    {@render item(node, index === tree.length - 1)}
  {/each}
</nav>
