<script lang="ts">
import SvelteMarkdown, {
  allowHtmlOnly,
  defaultRenderers,
  defaultSanitizeUrl,
} from '@humanspeak/svelte-markdown'
import type { MarkedExtension } from 'marked'

import ApiUrlCodeBlock from '#lib/bits/components/api-url-code-block.svelte'
import { getMarkdownHeadingId } from '#lib/registry/markdownHeading.js'

import type {
  ReleaseNotesLabels,
  ReleaseNotesTransclusion,
} from '../releaseNotes.types'
import ReleaseNotesBadge from './releaseNotesBadge.svelte'
import ReleaseNotesCallout from './releaseNotesCallout.svelte'
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
  note: ReleaseNotesCallout,
  // Glossary and definition content uses a small amount of presentational HTML
  // (`<i>` and `<br>`). Render those elements rather than exposing their source
  // text, while keeping every other ordinary HTML element escaped.
  html: allowHtmlOnly(['br', 'i']),
}

const releaseNotesMarkdownExtensions: MarkedExtension[] = [
  {
    extensions: [
      {
        name: 'note',
        level: 'block',
        start(source) {
          return source.match(/<note\b/i)?.index
        },
        tokenizer(source) {
          const match =
            /^<note(?:\s+title=(?:"([^"]*)"|'([^']*)'))?\s*>\s*\n?([\s\S]*?)<\/note>\s*/i.exec(
              source,
            )
          if (!match) return

          const [, doubleQuotedTitle, singleQuotedTitle, content] = match
          return {
            type: 'note',
            raw: match[0],
            title: doubleQuotedTitle ?? singleQuotedTitle,
            tokens: this.lexer.blockTokens(content),
          }
        },
      },
    ],
  },
]

function sanitiseUrl(url: string) {
  return transclusions[url] ? url : defaultSanitizeUrl(url, { type: 'link', tag: 'a' })
}
</script>

{#key markdown}
  <SvelteMarkdown
    source={markdown}
    renderers={releaseNotesRenderers}
    sanitizeUrl={sanitiseUrl}
    extensions={releaseNotesMarkdownExtensions}
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
