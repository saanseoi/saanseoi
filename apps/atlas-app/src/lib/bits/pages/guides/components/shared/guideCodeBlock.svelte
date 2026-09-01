<script lang="ts">
import type { Snippet } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Dialog } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  actions?: Snippet
  class?: string
  code: string
  copyLabelSuffix?: Snippet
  copyCode?: string
  displayCode?: string
  comments?: Array<{
    alwaysVisible?: boolean
    html?: boolean
    line: number
    spacerAfter?: boolean
    text: string
  }>
  commentsVisible?: boolean
  copyable?: boolean
  copiedLabel: string
  copyLabel: string
  dimmedLines?: number[]
  editorIcon?: string
  label: string
  labelContent?: Snippet
  language?: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  leadingActions?: Snippet
  onCopy?: (outcome: 'success' | 'failure') => void
  onVisibleLinesChange?: (lines: GuideCodeVisibleLine[]) => void
  pathSeparator?: '\\'
  promptIcon?: string
  terminalDotsSuffix?: Snippet
  variant?: 'code' | 'editor' | 'prompt'
  width?: 'content' | 'short' | 'shortCard'
}

type BashTokenKind = 'command' | 'comment' | 'flag' | 'operator' | 'plain' | 'string'
type SourceTokenKind =
  | 'comment'
  | 'keyword'
  | 'number'
  | 'plain'
  | 'selector'
  | 'string'

export type GuideCodeVisibleLine = {
  line: number
  top: number
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const bashTokenClass: Record<BashTokenKind, string> = {
  command: 'font-bold text-[#80e7c7]',
  comment: 'text-[#7e938e]',
  flag: 'text-[#91bfff]',
  operator: 'text-[#ef9da5]',
  plain: '',
  string: 'text-[#ffd28a]',
}
const sourceTokenClass: Record<Exclude<SourceTokenKind, 'plain'>, string> = {
  comment: 'text-[#7e938e]',
  keyword: 'text-[#d7a6ff]',
  number: 'text-[#ffd28a]',
  selector: 'text-[#80e7c7]',
  string: 'text-[#a5d6ff]',
}

const codeCommentColumns = 83

const splitCodeComment = (text: string, maximumLength: number) => {
  const lines: string[] = []
  let line = ''

  for (const word of text.trim().split(/\s+/)) {
    if (word.length > maximumLength) {
      if (line) lines.push(line)
      lines.push(...(word.match(new RegExp(`.{1,${maximumLength}}`, 'g')) ?? []))
      line = ''
    } else if (!line || line.length + word.length + 1 <= maximumLength) {
      line = line ? `${line} ${word}` : word
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

const highlightBash = (source: string, prompt = '$') => {
  let multilineTerminator: string | undefined
  let continuesFromPreviousLine = false

  return source
    .split('\n')
    .map(line => {
      const trimmedLine = line.trim()

      if (multilineTerminator) {
        if (trimmedLine === multilineTerminator) multilineTerminator = undefined

        return `<span class="block">${escapeHtml(line) || '&nbsp;'}</span>`
      }

      if (!trimmedLine) return '<span class="block">&nbsp;</span>'

      const comment = line.match(/^(\s*)#\s?(.*)$/)
      if (comment) {
        const indentation = comment[1] ?? ''
        const content = comment[2] ?? ''
        return splitCodeComment(content, codeCommentColumns - indentation.length - 2)
          .map(
            text =>
              `<span class="block"><span class="text-[#7e938e]">${escapeHtml(`${indentation}# ${text}`)}</span></span>`,
          )
          .join('')
      }

      let commandSeen = false
      const tokens =
        line.match(
          /\s+|#[^\n]*|'[^']*'|"[^"]*"|`[^`]*`|&&|\|\||[|;]|--?[\w-]+|[^\s]+/g,
        ) ?? []
      const content = tokens
        .map(token => {
          let kind: BashTokenKind = 'plain'

          if (/^\s+$/.test(token)) return escapeHtml(token)
          if (token.startsWith('#')) kind = 'comment'
          else if (/^['"`]/.test(token)) kind = 'string'
          else if (/^(&&|\|\||[|;])$/.test(token)) kind = 'operator'
          else if (/^--?[\w-]+$/.test(token)) kind = 'flag'
          else if (!commandSeen) {
            kind = 'command'
            commandSeen = true
          }

          return `<span class="${bashTokenClass[kind]}">${escapeHtml(token)}</span>`
        })
        .join('')

      const bashHereDocument = line.match(
        /<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))/,
      )
      const powershellHereString = /@\s*(['"])\s*$/.exec(line)
      if (bashHereDocument) {
        multilineTerminator =
          bashHereDocument[1] ?? bashHereDocument[2] ?? bashHereDocument[3]
      } else if (powershellHereString) {
        multilineTerminator = `${powershellHereString[1]}@`
      }

      const prefix = continuesFromPreviousLine
        ? ''
        : `<span class="mr-[0.6rem] select-none text-[#65d8ba]" aria-hidden="true">${prompt}</span>`
      continuesFromPreviousLine = /(?<!\\)\\$/.test(line)

      return `<span class="block">${prefix}${content}</span>`
    })
    .join('')
}

const highlightSource = (
  source: string,
  language: 'css' | 'typescript',
  dimmedLines: number[] = [],
  comments: Array<{
    alwaysVisible?: boolean
    html?: boolean
    line: number
    spacerAfter?: boolean
    text: string
  }> = [],
  commentsVisible = false,
) =>
  source
    .split('\n')
    .map((line, index) => {
      const isSourceComment = /^\s*(?:\/\/|\/\*)/.test(line)
      const tokens =
        line.match(
          /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'[^']*'|"[^"]*"|`[^`]*`|#[\w-]+|\.[\w-]+|\b\d+(?:\.\d+)?\b|\b(?:import|from|new|const|let|return|type|interface|export|default|class|function|async|await|if|else|true|false|html|body|width|height|margin|padding|display|background|color)\b|\s+|[^\s]+/g,
        ) ?? []
      const content = tokens
        .map(token => {
          if (/^\s+$/.test(token)) return escapeHtml(token)

          let kind: SourceTokenKind = 'plain'
          if (/^(\/\/|\/\*)/.test(token)) kind = 'comment'
          else if (/^['"`]/.test(token)) kind = 'string'
          else if (/^\d/.test(token)) kind = 'number'
          else if (
            language === 'css' &&
            (/^[#.]/.test(token) || /^(html|body)$/.test(token))
          ) {
            kind = 'selector'
          } else if (
            /^(import|from|new|const|let|return|type|interface|export|default|class|function|async|await|if|else|true|false|width|height|margin|padding|display|background|color)$/.test(
              token,
            )
          ) {
            kind = 'keyword'
          }

          const escaped = escapeHtml(token)
          return kind === 'plain'
            ? escaped
            : `<span class="${sourceTokenClass[kind]}">${escaped}</span>`
        })
        .join('')

      const matchingComments = comments.filter(
        candidate =>
          candidate.line === index + 1 && !dimmedLines.includes(candidate.line),
      )
      const indentation = escapeHtml(line.match(/^\s*/)?.[0] ?? '')
      const renderedComments = matchingComments
        .flatMap(comment => {
          const maximumLength = codeCommentColumns - indentation.length - 3
          const isVisible = commentsVisible || comment.alwaysVisible
          const visibility = isVisible
            ? 'max-h-6 opacity-100 transform-[rotateX(0deg)]'
            : 'max-h-0 opacity-0 transform-[rotateX(-90deg)]'
          const commentLines = splitCodeComment(comment.text, maximumLength).map(
            text =>
              `<span data-code-comment-for="${comment.line}" aria-hidden="${!isVisible}" class="block overflow-hidden text-[#7e938e] transition-[max-height,opacity,transform] duration-300 origin-top motion-reduce:transition-none ${visibility}">${indentation}// ${comment.html ? text : escapeHtml(text)}</span>`,
          )

          if (comment.spacerAfter) {
            commentLines.push(
              `<span aria-hidden="${!isVisible}" class="block overflow-hidden transition-[max-height,opacity,transform] duration-300 origin-top motion-reduce:transition-none ${visibility}">&nbsp;</span>`,
            )
          }

          return commentLines
        })
        .join('')

      const sourceComment = line.match(/^(\s*\/\/\s?)(.*)$/)
      if (sourceComment) {
        const prefix = sourceComment[1] ?? '// '
        const maximumLength = codeCommentColumns - prefix.length
        const visibility = commentsVisible
          ? 'max-h-6 opacity-100 transform-[rotateX(0deg)]'
          : 'max-h-0 opacity-0 transform-[rotateX(-90deg)]'
        const sourceCommentLines = splitCodeComment(
          sourceComment[2] ?? '',
          maximumLength,
        )
          .map(
            text =>
              `<span data-code-line="${index + 1}" class="block overflow-hidden ${visibility}"><span class="${sourceTokenClass.comment}">${escapeHtml(`${prefix}${text}`)}</span></span>`,
          )
          .join('')

        return `${renderedComments}${sourceCommentLines}`
      }

      const sourceCommentVisibility = isSourceComment
        ? ` overflow-hidden transition-[max-height,opacity,transform] duration-300 origin-top motion-reduce:transition-none ${commentsVisible ? 'max-h-6 opacity-100 transform-[rotateX(0deg)]' : 'max-h-0 opacity-0 transform-[rotateX(-90deg)]'}`
        : ''

      return `${renderedComments}<span data-code-line="${index + 1}" class="block${sourceCommentVisibility}${dimmedLines.includes(index + 1) ? ' opacity-40' : ''}">${content || '&nbsp;'}</span>`
    })
    .join('')

let {
  actions,
  class: className = '',
  code,
  copyLabelSuffix,
  copyCode,
  displayCode,
  comments = [],
  commentsVisible = $bindable(true),
  copyable = true,
  copiedLabel,
  copyLabel,
  dimmedLines = [],
  editorIcon = 'material-symbols-light:code-rounded',
  label,
  language = 'text',
  leadingActions,
  labelContent,
  onCopy,
  onVisibleLinesChange,
  pathSeparator,
  promptIcon = 'material-symbols-light:auto-awesome',
  terminalDotsSuffix,
  variant = 'code',
  width = 'shortCard',
}: Props = $props()
let copied = $state(false)
let manualCopyOpen = $state(false)
let manualCopyText: HTMLTextAreaElement
let codeElement: HTMLPreElement
let hiddenLinesAbove = $state(0)
let hiddenLinesBelow = $state(0)
const displayedLabel = $derived(
  (pathSeparator === '\\' && (label === '.env' || label.startsWith('src/'))
    ? label.replaceAll('/', '\\')
    : label
  ).replace(/\s(?:—|-)\s/gu, ' • '),
)
const editorLabel = $derived(
  variant === 'editor'
    ? displayedLabel.replace(
        /(\s•\s)(.*)$/u,
        (_, separator, title) => `${separator}${title.toLocaleLowerCase()}`,
      )
    : displayedLabel,
)
const highlightedCode = $derived(
  language === 'bash'
    ? highlightBash(displayCode ?? code)
    : language === 'powershell'
      ? highlightBash(displayCode ?? code, 'PS>')
      : language === 'typescript' || language === 'css'
        ? highlightSource(
            displayCode ?? code,
            language,
            dimmedLines,
            comments,
            commentsVisible,
          )
        : escapeHtml(displayCode ?? code),
)
const hasSourceComments = $derived(
  variant === 'editor' &&
    (language === 'typescript' || language === 'css') &&
    /(?:^|\n)\s*(?:\/\/|\/\*)/.test(displayCode ?? code),
)
const hasCommentsToggle = $derived(comments.length > 0 || hasSourceComments)
const codeToCopy = $derived(
  variant === 'editor'
    ? `\n${(copyCode ?? code).replace(/^\n+/, '')}`
    : (copyCode ?? code),
)

const copyWithFallback = (text: string) => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(textarea)
  textarea.select()
  const success = document.execCommand('copy')
  textarea.remove()

  return success
}

async function copy() {
  if (variant === 'prompt') {
    manualCopyOpen = true
    onCopy?.('success')
    return
  }

  try {
    await navigator.clipboard.writeText(codeToCopy)
  } catch {
    if (!copyWithFallback(codeToCopy)) {
      onCopy?.('failure')
      manualCopyOpen = true
      return
    }
  }

  onCopy?.('success')
  copied = true
  window.setTimeout(() => (copied = false), 1600)
}

const selectManualCopyText = () => {
  manualCopyText.focus()
  manualCopyText.select()
}

function reportVisibleLines() {
  if (!codeElement) return

  const viewport = codeElement.getBoundingClientRect()
  const card = codeElement.parentElement?.getBoundingClientRect()
  if (!card) return
  const sourceLines = Array.from(
    codeElement.querySelectorAll<HTMLElement>('[data-code-line]'),
  ).filter(line => line.getBoundingClientRect().height > 0)
  const lines = sourceLines
    .filter(line => {
      const rect = line.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom
    })
    .map(line => ({
      line: Number(line.dataset.codeLine),
      top: line.getBoundingClientRect().top - card.top,
    }))
    .filter(({ line }) => Number.isFinite(line))

  const uniqueLines = lines.filter(
    (candidate, index) =>
      lines.findIndex(other => other.line === candidate.line) === index,
  )
  const allLineNumbers = [
    ...new Set(
      sourceLines.map(line => Number(line.dataset.codeLine)).filter(Number.isFinite),
    ),
  ]
  const firstVisibleLine = uniqueLines[0]?.line
  const lastVisibleLine = uniqueLines.at(-1)?.line
  const firstVisibleIndex = allLineNumbers.indexOf(firstVisibleLine ?? -1)
  const lastVisibleIndex = allLineNumbers.indexOf(lastVisibleLine ?? -1)
  hiddenLinesAbove = firstVisibleIndex > 0 ? firstVisibleIndex : 0
  hiddenLinesBelow =
    lastVisibleIndex >= 0 ? allLineNumbers.length - lastVisibleIndex - 1 : 0

  onVisibleLinesChange?.(uniqueLines)
}

$effect(() => {
  void commentsVisible
  requestAnimationFrame(reportVisibleLines)
})
</script>

<div
  class={`${className} flex w-full min-w-0 flex-col ${width === 'content' ? 'max-w-232' : width === 'short' ? 'max-w-3xl' : 'max-w-178'} max-h-[min(1080px,calc(100dvh-4.5rem))] overflow-hidden border font-mono shadow-card ${variant === 'prompt' ? 'max-h-[640px]' : ''} ${
    variant === 'prompt'
      ? 'border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#171521]'
      : variant === 'editor'
        ? 'border-[#596074] bg-[#131722]'
      : 'border-[#47605b] bg-[#101515]'
  }`}
>
  <div
    data-guide-code-header
    class={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 ${
    variant === 'prompt'
      ? 'border-[color-mix(in_srgb,var(--color-secondary)_45%,#5a4a85)] bg-[#211d32]'
      : variant === 'editor'
        ? 'border-[#596074] bg-[#202633]'
      : 'border-[#47605b] bg-[#182021]'
    }`}
  >
    <div data-guide-code-header-leading class="flex min-w-0 items-center gap-3">
      {#if variant === 'prompt'}
        <span
          class="inline-flex size-7 items-center justify-center rounded-full [background:color-mix(in_srgb,var(--color-secondary)_18%,#211d32)] text-secondary"
          aria-hidden="true"
        >
          <Icon icon={promptIcon} class="size-4" />
        </span>
      {:else if variant === 'editor'}
        <span
          data-guide-code-editor-icon
          class="inline-flex size-7 items-center justify-center rounded-sm bg-[#2d3547] text-[#a5d6ff]"
          aria-hidden="true"
        >
          <Icon icon={editorIcon} class="size-4" />
        </span>
      {:else}
        <span class="flex gap-1.5" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-[#ef8b88]"></span>
          <span class="size-2.5 rounded-full bg-[#f2c26d]"></span>
          <span class="size-2.5 rounded-full bg-[#75c89c]"></span>
        </span>
        {@render terminalDotsSuffix?.()}
      {/if}
      <span
        data-guide-code-label
        class={`font-semibold ${
          variant === 'prompt'
            ? 'font-body tracking-[0.01em] text-[#eeeaff]'
            : variant === 'editor'
              ? 'font-mono text-label-sm text-[#d6e4ff]'
            : 'font-mono text-label-sm text-white/75'
        }`}
        >{#if labelContent}
          {@render labelContent()}
        {:else}
          {@html editorLabel}
        {/if}</span
      >
    </div>
    {#if copyable || actions || hasCommentsToggle}
      <div data-guide-code-actions class="flex shrink-0 items-center gap-4">
        {@render leadingActions?.()}
        {#if hasCommentsToggle}
          <button
            data-guide-code-comments-toggle
            class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
            type="button"
            aria-pressed={commentsVisible}
            onclick={() => (commentsVisible = !commentsVisible)}
          >
            <Icon icon="proicons:chat" class="size-4" aria-hidden="true" />
            {m.guide_code_block_comments()}
          </button>
        {/if}
        {@render actions?.()}
        {#if copyable}
          <button
            data-guide-code-copy
            class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
            type="button"
            onclick={copy}
          >
            <Icon
              icon={copied ? 'ion:checkmark' : 'ion:copy-outline'}
              class="size-4"
              aria-hidden="true"
            />
            {copied ? copiedLabel : copyLabel}
            {@render copyLabelSuffix?.()}
          </button>
        {/if}
      </div>
    {/if}
  </div>
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <pre
      bind:this={codeElement}
      onscroll={reportVisibleLines}
      class={`m-0 size-full min-h-0 min-w-0 max-w-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-4 ${
      variant === 'prompt'
        ? 'min-h-0 overflow-y-auto overscroll-contain bg-[#14121e] font-body text-body-md leading-7 text-[#eeeaff]'
        : variant === 'editor'
          ? 'bg-[#131722] font-mono text-sm leading-6 text-[#d6e4ff]'
        : 'bg-[#0c1111] font-mono text-sm leading-6 text-[#d6e4df]'
      }`}
    ><code>{@html highlightedCode}</code></pre>
    {#if hiddenLinesAbove > 0}
      <span
        class="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 border border-[#596074] bg-[#202633]/95 px-2 py-1 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-[#a5d6ff] shadow-sm"
        >{`{${m.guide_code_block_more_lines_above({ count: hiddenLinesAbove })}}`}</span
      >
    {/if}
    {#if hiddenLinesBelow > 0}
      <span
        class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 border border-[#596074] bg-[#202633]/95 px-2 py-1 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-[#a5d6ff] shadow-sm"
        >{`{${m.guide_code_block_more_lines_below({ count: hiddenLinesBelow })}}`}</span
      >
    {/if}
  </div>
</div>

<Dialog.Root bind:open={manualCopyOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-80 bg-black/70 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-90 max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto border border-secondary/50 bg-surface-container-low p-6 shadow-popover focus:outline-none sm:p-8"
    >
      <Dialog.Title class="font-display text-headline-sm font-bold text-primary">
        {m.guide_code_block_manual_copy_title()}
      </Dialog.Title>
      <Dialog.Description
        class="mt-3 font-body text-body-lg leading-8 text-foreground-alt"
      >
        {m.guide_code_block_manual_copy_description()}
      </Dialog.Description>
      <textarea
        bind:this={manualCopyText}
        class="mt-6 min-h-64 w-full resize-y border border-border-card bg-[#0c1111] p-4 font-mono text-sm leading-6 text-[#d6e4df] outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
        readonly
        value={codeToCopy}
        aria-label={m.guide_code_block_manual_copy_text_label()}
        onclick={selectManualCopyText}
      ></textarea>
      <div class="mt-5 flex flex-wrap justify-end gap-3">
        <button
          class="inline-flex items-center gap-2 border border-secondary bg-secondary px-4 py-2 font-body text-label-md font-semibold text-on-secondary hover:bg-secondary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          type="button"
          onclick={selectManualCopyText}
        >
          <Icon icon="ion:select-outline" class="size-4" aria-hidden="true" />
          {m.guide_code_block_select_all()}
        </button>
        <button
          class="inline-flex border border-border-card px-4 py-2 font-body text-label-md font-semibold text-foreground-alt hover:border-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          type="button"
          onclick={() => (manualCopyOpen = false)}
        >
          {m.common_close()}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
