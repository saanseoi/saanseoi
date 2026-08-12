<script lang="ts">
import * as ReleaseNotes from '../../releaseNotes'
import type { ReleaseNotesPresentation } from '../../releaseNotes'

type Props = {
  kind: 'removed' | 'added'
  markdown: string
  label: string
  notes: ReleaseNotesPresentation
}

let { kind, markdown, label, notes }: Props = $props()
let isEmpty = $derived(!markdown.trim())
let tone = $derived(kind === 'removed' ? 'border-data-error' : 'border-data-success')
</script>

<section
  class={`min-w-0 border-l-4 pl-4 ${tone} ${isEmpty ? 'hidden lg:block' : ''}`}
  aria-label={isEmpty ? undefined : label}
  aria-hidden={isEmpty || undefined}
  data-release-diff-pane={kind}
  data-empty={isEmpty || undefined}
>
  {#if !isEmpty}
    <p
      class="mb-2 font-body text-label-sm font-semibold uppercase tracking-[0.08em] lg:hidden"
    >
      {label}
    </p>
    <div
      class="prose prose-neutral prose-sm max-w-none prose-headings:my-2 prose-headings:scroll-mt-24 prose-p:my-2 prose-ul:my-2 lg:prose-headings:scroll-mt-[120px] dark:prose-invert"
    >
      <ReleaseNotes.Content
        {markdown}
        labels={notes.labels}
        transclusions={notes.transclusions}
      />
    </div>
  {/if}
</section>
