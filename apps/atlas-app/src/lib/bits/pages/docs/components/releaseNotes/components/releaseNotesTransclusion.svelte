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
let icon = $derived(
  transclusion.type === 'definition' ? 'ion:book-outline' : 'ion:document-text-outline',
)
</script>

<Popover.Root>
  <Popover.Trigger
    class="mx-0.75 inline-flex cursor-pointer items-center gap-1 font-medium text-blue-700 decoration-2 decoration-dotted underline underline-offset-[0.3em] hover:text-blue-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-blue-300 dark:hover:text-blue-100 dark:focus-visible:outline-blue-300"
    aria-label={labels.showTransclusion(transclusion.title)}
    {title}
  >
    {@render children?.()}
    <Icon {icon} class="size-4" aria-hidden="true" />
  </Popover.Trigger>
  <Popover.ContentStatic
    class="-ml-10 my-4 max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto border border-sky-300 border-l-4 border-l-sky-600 bg-sky-50 text-left text-slate-900 shadow-sm origin-top-left data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 dark:border-sky-800 dark:border-l-sky-400 dark:bg-[#131f25] dark:text-sky-100"
  >
    <div
      class="flex items-center justify-between gap-4 border-b border-sky-300 bg-sky-100 px-5 py-3 font-body text-label-sm font-semibold uppercase tracking-[0.08em] text-sky-900 dark:border-sky-800 dark:bg-sky-900/70 dark:text-sky-100"
    >
      <span class="flex items-center gap-2">
        <Icon {icon} class="size-4" aria-hidden="true" />
        {transclusion.title}
      </span>
      <span class="flex items-center gap-1">
        <span class="font-mono text-xs normal-case tracking-normal"
          >{transclusion.version}</span
        >
        <Popover.Close
          class="rounded-sm p-1 text-sky-700 transition hover:bg-sky-200 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:text-sky-300 dark:hover:bg-sky-800 dark:hover:text-sky-100 dark:focus-visible:outline-sky-300"
          aria-label={labels.closeTransclusion}
        >
          <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
        </Popover.Close>
      </span>
    </div>
    <div
      class="prose max-w-none px-5 pb-5 pt-4 prose-a:text-sky-700 prose-a:decoration-sky-500/60 prose-a:hover:text-sky-900 prose-ul:my-2 prose-li:my-1 dark:prose-invert dark:prose-a:text-sky-300 dark:prose-a:decoration-sky-400/60 dark:prose-a:hover:text-sky-100"
    >
      <ReleaseNotesContent
        markdown={transclusion.markdown}
        {labels}
        {transclusions}
        nested
      />
    </div>
  </Popover.ContentStatic>
</Popover.Root>
