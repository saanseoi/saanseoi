<script lang="ts">
import Icon from '@iconify/svelte'
import { Dialog } from 'bits-ui'

import { m } from '$lib/bits/internal/i18n'

type Props = {
  code: string
  copyable?: boolean
  copiedLabel: string
  copyLabel: string
  editorIcon?: string
  label: string
  language?: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  promptIcon?: string
  variant?: 'code' | 'editor' | 'prompt'
}

type BashTokenKind = 'command' | 'comment' | 'flag' | 'operator' | 'plain' | 'string'
type SourceTokenKind =
  | 'comment'
  | 'keyword'
  | 'number'
  | 'plain'
  | 'selector'
  | 'string'

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

const highlightBash = (source: string, prompt = '$') =>
  source
    .split('\n')
    .map(line => {
      const comment = line.match(/^(\s*)#\s?(.*)$/)
      if (comment) {
        const indentation = comment[1] ?? ''
        const content = comment[2] ?? ''
        if (indentation) {
          return `<span class="block"><span class="text-[#7e938e]">${escapeHtml(`${indentation}# ${content}`)}</span></span>`
        }

        return `<span class="block"><span class="mr-[0.6rem] select-none text-[#7e938e]" aria-hidden="true">#</span><span class="text-[#7e938e]">${escapeHtml(content)}</span></span>`
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

      return `<span class="block"><span class="mr-[0.6rem] select-none text-[#65d8ba]" aria-hidden="true">${prompt}</span>${content}</span>`
    })
    .join('')

const highlightSource = (source: string, language: 'css' | 'typescript') =>
  source
    .split('\n')
    .map(line => {
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

      return `<span class="block">${content}</span>`
    })
    .join('')

let {
  code,
  copyable = true,
  copiedLabel,
  copyLabel,
  editorIcon = 'material-symbols-light:code-rounded',
  label,
  language = 'text',
  promptIcon = 'material-symbols-light:auto-awesome',
  variant = 'code',
}: Props = $props()
let copied = $state(false)
let manualCopyOpen = $state(false)
let manualCopyText: HTMLTextAreaElement
const highlightedCode = $derived(
  language === 'bash'
    ? highlightBash(code)
    : language === 'powershell'
      ? highlightBash(code, 'PS>')
      : language === 'typescript' || language === 'css'
        ? highlightSource(code, language)
        : escapeHtml(code),
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
    return
  }

  try {
    await navigator.clipboard.writeText(code)
  } catch {
    if (!copyWithFallback(code)) {
      manualCopyOpen = true
      return
    }
  }

  copied = true
  window.setTimeout(() => (copied = false), 1600)
}

const selectManualCopyText = () => {
  manualCopyText.focus()
  manualCopyText.select()
}
</script>

<div
  class={`overflow-hidden border shadow-card ${variant === 'prompt' ? 'flex max-h-[640px] flex-col' : ''} ${
    variant === 'prompt'
      ? 'border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#171521]'
      : variant === 'editor'
        ? 'border-[#596074] bg-[#131722]'
      : 'border-[#47605b] bg-[#101515]'
  }`}
>
  <div
    class={`flex items-center justify-between gap-3 border-b px-4 py-2.5 ${
    variant === 'prompt'
      ? 'border-[color-mix(in_srgb,var(--color-secondary)_45%,#5a4a85)] bg-[#211d32]'
      : variant === 'editor'
        ? 'border-[#596074] bg-[#202633]'
      : 'border-[#47605b] bg-[#182021]'
    }`}
  >
    <div class="flex min-w-0 items-center gap-3">
      {#if variant === 'prompt'}
        <span
          class="inline-flex size-7 items-center justify-center rounded-full [background:color-mix(in_srgb,var(--color-secondary)_18%,#211d32)] text-secondary"
          aria-hidden="true"
        >
          <Icon icon={promptIcon} class="size-4" />
        </span>
      {:else if variant === 'editor'}
        <span
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
      {/if}
      <span
        class={`font-semibold ${
          variant === 'prompt'
            ? 'font-body tracking-[0.01em] text-[#eeeaff]'
            : variant === 'editor'
              ? 'font-mono text-label-sm text-[#d6e4ff]'
            : 'font-mono text-label-sm text-white/75'
        }`}
        >{@html label}</span
      >
    </div>
    {#if copyable}
      <button
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
      </button>
    {/if}
  </div>
  <pre
    class={`m-0 whitespace-pre-wrap wrap-break-word p-4 ${
      variant === 'prompt'
        ? 'min-h-0 overflow-y-auto overscroll-contain bg-[#14121e] font-body text-body-md leading-7 text-[#eeeaff]'
        : variant === 'editor'
          ? 'bg-[#131722] font-mono text-sm leading-6 text-[#d6e4ff]'
        : 'bg-[#0c1111] font-mono text-sm leading-6 text-[#d6e4df]'
    }`}
  ><code>{@html highlightedCode}</code></pre>
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
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt"
      >
        {m.guide_code_block_manual_copy_description()}
      </Dialog.Description>
      <textarea
        bind:this={manualCopyText}
        class="mt-6 min-h-64 w-full resize-y border border-border-card bg-[#0c1111] p-4 font-mono text-sm leading-6 text-[#d6e4df] outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
        readonly
        value={code}
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
