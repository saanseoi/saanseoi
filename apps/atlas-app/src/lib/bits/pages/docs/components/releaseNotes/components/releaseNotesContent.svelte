<script lang="ts">
import SvelteMarkdown, {
  buildUnsupportedHTML,
  defaultRenderers,
  defaultSanitizeUrl,
} from '@humanspeak/svelte-markdown'

import ApiUrlCodeBlock from '#lib/bits/components/api-url-code-block.svelte'
import { getMarkdownHeadingId } from '#lib/registry/markdownHeading.js'

import type {
  ReleaseNotesLabels,
  ReleaseNotesTransclusion,
} from '../releaseNotes.types'
import ReleaseNotesBadge from './releaseNotesBadge.svelte'
import ReleaseNotesCodeSpan from './releaseNotesCodeSpan.svelte'
import ReleaseNotesHeading from './releaseNotesHeading.svelte'
import ReleaseNotesLink from './releaseNotesLink.svelte'

type Props = {
  markdown: string
  labels: ReleaseNotesLabels
  transclusions: Record<string, ReleaseNotesTransclusion>
  nested?: boolean
}

let { markdown, labels, transclusions, nested = false }: Props = $props()

const releaseNotesRenderers = {
  ...defaultRenderers,
  html: buildUnsupportedHTML(),
}

function sanitiseUrl(url: string) {
  return transclusions[url] ? url : defaultSanitizeUrl(url, { type: 'link', tag: 'a' })
}
</script>

{#key markdown}
  <SvelteMarkdown
    source={markdown}
    renderers={releaseNotesRenderers}
    sanitizeUrl={sanitiseUrl}
  >
    {#snippet heading({ depth, text, children, slug })}
      <ReleaseNotesHeading
        {depth}
        id={getMarkdownHeadingId(slug(text))}
        tableLabel={depth === 3 && /^(Primary|Supporting|主要|支援|支持) · /.test(text)}
      >
        {@render children?.()}
      </ReleaseNotesHeading>
    {/snippet}

    {#snippet rawtext({ text })}
      <span class="contents">{text}</span>
    {/snippet}

    {#snippet code({ lang, text })}
      <ApiUrlCodeBlock {lang} {text} />
    {/snippet}

    {#snippet codespan({ raw })}
      <ReleaseNotesCodeSpan {raw} {nested} />
    {/snippet}

    {#snippet html_mono({ children })}
      <span class="not-prose mx-0.75 font-mono text-[0.9em]"
        >{@render children?.()}</span
      >
    {/snippet}

    {#snippet html_saanseoi({ children })}
      <ReleaseNotesBadge tone="saanseoi" {nested}
        >{@render children?.()}</ReleaseNotesBadge
      >
    {/snippet}

    {#snippet html_red({ children })}
      <ReleaseNotesBadge tone="red" {nested}>{@render children?.()}</ReleaseNotesBadge>
    {/snippet}

    {#snippet html_orange({ children })}
      <ReleaseNotesBadge tone="orange" {nested}
        >{@render children?.()}</ReleaseNotesBadge
      >
    {/snippet}

    {#snippet html_blue({ children })}
      <ReleaseNotesBadge tone="blue" {nested}>{@render children?.()}</ReleaseNotesBadge>
    {/snippet}

    {#snippet html_black({ children })}
      <ReleaseNotesBadge tone="black" {nested}
        >{@render children?.()}</ReleaseNotesBadge
      >
    {/snippet}

    {#snippet link({ href, title, children })}
      <ReleaseNotesLink {href} {title} {labels} {transclusions}>
        {@render children?.()}
      </ReleaseNotesLink>
    {/snippet}
  </SvelteMarkdown>
{/key}
