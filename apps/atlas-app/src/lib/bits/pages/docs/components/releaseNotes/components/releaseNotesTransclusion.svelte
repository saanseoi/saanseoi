<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Popover } from 'bits-ui'
import type { Snippet } from 'svelte'

import type {
  ReleaseNotesLabels,
  ReleaseNotesTransclusion,
} from '../releaseNotes.types'
import ReleaseNotesContent from './releaseNotesContent.svelte'

type Props = {
  transclusion: ReleaseNotesTransclusion
  labels: ReleaseNotesLabels
  transclusions: Record<string, ReleaseNotesTransclusion>
  title?: string | null
  children?: Snippet
}

let { transclusion, labels, transclusions, title, children }: Props = $props()
let trigger = $state<HTMLButtonElement | null>(null)
let icon = $derived(
  transclusion.type === 'definition' ? 'ion:book-outline' : 'ion:document-text-outline',
)
let contentColumnAnchor = $derived.by(() => {
  const triggerElement = trigger
  if (!triggerElement) return null

  const contentColumn = triggerElement.closest<HTMLElement>(
    '[data-release-nav-content-body]',
  )
  if (!contentColumn) return null

  return {
    getBoundingClientRect() {
      const column = contentColumn.getBoundingClientRect()
      const triggerRect = triggerElement.getBoundingClientRect()

      return new DOMRect(column.left, triggerRect.top, column.width, triggerRect.height)
    },
  }
})
</script>

<Popover.Root>
  <Popover.Trigger
    bind:ref={trigger}
    class="mx-0.75 inline-flex cursor-pointer items-center gap-1 font-medium text-blue-700 decoration-2 decoration-dotted underline underline-offset-[0.3em] hover:text-blue-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-blue-300 dark:hover:text-blue-100 dark:focus-visible:outline-blue-300"
    aria-label={labels.showTransclusion(transclusion.title)}
    {title}
  >
    {@render children?.()}
    <Icon {icon} class="size-4" aria-hidden="true" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="release-notes-transclusion z-70 max-h-[min(46rem,calc(100vh-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto bg-surface-container-lowest pt-4 text-left shadow-popover"
      side="bottom"
      align="start"
      sideOffset={6}
      collisionPadding={16}
      customAnchor={contentColumnAnchor}
    >
      <div
        class="border border-sky-300 border-l-sky-600 bg-sky-50 text-slate-900 dark:border-sky-800 dark:border-l-sky-400 dark:bg-[#131f25] dark:text-sky-100"
      >
        <div
          class="flex items-center justify-between gap-4 border-b border-sky-300 bg-sky-100 px-6 py-3 font-body text-label-sm font-semibold uppercase tracking-[0.08em] text-sky-900 dark:border-sky-800 dark:bg-sky-900/70 dark:text-sky-100"
        >
          <span class="flex items-center gap-2">
            <Icon {icon} class="size-4" aria-hidden="true" />
            {transclusion.title}
          </span>
          <span class="flex items-center gap-1.5">
            <span
              class="relative -translate-y-px font-mono text-xs normal-case tracking-normal"
              >{transclusion.version}</span
            >
            <Popover.Close
              class="inline-flex size-7.5 items-center justify-center rounded-full text-sky-700 transition hover:bg-sky-200 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:text-sky-300 dark:hover:bg-sky-800 dark:hover:text-sky-100 dark:focus-visible:outline-sky-300"
              aria-label={labels.closeTransclusion}
            >
              <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
            </Popover.Close>
          </span>
        </div>
        <div
          class="prose max-w-none px-6 pb-6 pt-5 prose-a:text-sky-700 prose-a:decoration-sky-500/60 prose-a:hover:text-sky-900 prose-ul:my-2 prose-li:my-1 dark:prose-invert dark:prose-a:text-sky-300 dark:prose-a:decoration-sky-400/60 dark:prose-a:hover:text-sky-100"
        >
          <ReleaseNotesContent
            markdown={transclusion.markdown}
            {labels}
            {transclusions}
            nested
          />
        </div>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
:global(.release-notes-transclusion) {
  width: var(--bits-popover-anchor-width);
  transform-origin: var(--bits-popover-content-transform-origin);
}

:global(.release-notes-transclusion[data-state="open"]) {
  animation: release-notes-transclusion-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

:global(.release-notes-transclusion[data-state="closed"]) {
  animation: release-notes-transclusion-out 100ms ease-in both;
}

@keyframes release-notes-transclusion-in {
  from {
    opacity: 0;
  }
}

@keyframes release-notes-transclusion-out {
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(.release-notes-transclusion[data-state]) {
    animation: none;
  }
}
</style>
