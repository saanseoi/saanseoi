<script lang="ts">
import type { AppLocale } from '$lib/bits/internal/i18n'
import {
  getMarkdownTransclusionDisplayTitle,
  type MarkdownGlossaryEntry,
} from '$lib/registry/referenceDocs'

import { Content as ReleaseNotesContent } from '../releaseNotes'

type Props = {
  entry: MarkdownGlossaryEntry
  locale: AppLocale
}

let { entry, locale }: Props = $props()
</script>

<article
  id={entry.id}
  class="border border-border-card bg-surface-container-low p-6 md:p-8"
>
  <div class="flex items-start justify-between gap-4">
    <h2 class="font-display text-headline-md font-bold text-secondary">
      {getMarkdownTransclusionDisplayTitle(entry, locale)}
    </h2>
    <span
      class="shrink-0 border border-border-card bg-background px-2 py-1 font-mono text-xs text-foreground-alt"
      >{entry.version}</span
    >
  </div>
  <div class="prose mt-4 max-w-none dark:prose-invert">
    <ReleaseNotesContent source={entry.markdown} {locale} />
  </div>
</article>
