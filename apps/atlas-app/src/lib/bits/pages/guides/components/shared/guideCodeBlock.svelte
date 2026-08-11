<script lang="ts">
import Icon from '@iconify/svelte'

type Props = {
  code: string
  copyable?: boolean
  copiedLabel: string
  copyLabel: string
  label: string
  language?: 'bash' | 'powershell' | 'text'
  promptIcon?: string
  variant?: 'code' | 'prompt'
}

type BashTokenKind = 'command' | 'comment' | 'flag' | 'operator' | 'plain' | 'string'

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
    .join('\n')

let {
  code,
  copyable = true,
  copiedLabel,
  copyLabel,
  label,
  language = 'text',
  promptIcon = 'material-symbols-light:auto-awesome',
  variant = 'code',
}: Props = $props()
let copied = $state(false)
const highlightedCode = $derived(
  language === 'bash'
    ? highlightBash(code)
    : language === 'powershell'
      ? highlightBash(code, 'PS>')
      : escapeHtml(code),
)

async function copy() {
  await navigator.clipboard.writeText(code)
  copied = true
  window.setTimeout(() => (copied = false), 1600)
}
</script>

<div
  class={`overflow-hidden border shadow-card ${
    variant === 'prompt'
      ? 'border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#171521]'
      : 'border-[#47605b] bg-[#101515]'
  }`}
>
  <div
    class={`flex items-center justify-between gap-3 border-b px-4 py-2.5 ${
      variant === 'prompt'
        ? 'border-[color-mix(in_srgb,var(--color-secondary)_45%,#5a4a85)] bg-[#211d32]'
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
        ? 'bg-[#14121e] font-body text-body-md leading-7 text-[#eeeaff]'
        : 'bg-[#0c1111] font-mono text-sm leading-6 text-[#d6e4df]'
    }`}
  ><code>{@html highlightedCode}</code></pre>
</div>
