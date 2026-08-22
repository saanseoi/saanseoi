<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  lang?: string
  text: string
}

let { lang, text }: Props = $props()

type UrlToken = {
  kind: 'path' | 'version' | 'family' | 'separator' | 'parameter' | 'value'
  value: string
}

type UrlLine = {
  indent: string
  tokens: UrlToken[]
}

function tokenisePath(value: string): UrlToken[] {
  const match = /^(\/v[^/]+)(\/[^/?]+)?(.*)$/.exec(value)
  if (!match) return [{ kind: 'path', value }]

  const [, version = '', family, rest = ''] = match
  const tokens: UrlToken[] = [{ kind: 'version', value: version }]

  if (family) tokens.push({ kind: 'family', value: family })
  if (rest) tokens.push({ kind: 'path', value: rest })

  return tokens
}

function tokeniseUrlLine(value: string): UrlToken[] {
  const queryIndex = value.indexOf('?')
  if (queryIndex === -1) return tokenisePath(value)

  return [
    ...tokenisePath(value.slice(0, queryIndex)),
    { kind: 'separator', value: '?' },
    ...tokeniseQuery(value.slice(queryIndex + 1)),
  ]
}

function tokeniseQuery(query: string): UrlToken[] {
  const tokens: UrlToken[] = []
  for (const [index, parameter] of query.split('&').entries()) {
    if (index > 0) tokens.push({ kind: 'separator', value: '&' })

    const equalsIndex = parameter.indexOf('=')
    if (equalsIndex === -1) {
      tokens.push({ kind: 'parameter', value: parameter })
      continue
    }

    tokens.push({ kind: 'parameter', value: parameter.slice(0, equalsIndex) })
    tokens.push({ kind: 'separator', value: '=' })
    tokens.push({ kind: 'value', value: parameter.slice(equalsIndex + 1) })
  }

  return tokens
}

function tokeniseUrl(value: string): UrlLine[] {
  return value
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map((line, lineIndex) => {
      const indent = /^\s*/.exec(line)?.[0] ?? ''
      const value = line.slice(indent.length)
      return {
        indent,
        tokens: lineIndex > 0 && indent ? tokeniseQuery(value) : tokeniseUrlLine(value),
      }
    })
}

let tokens = $derived(lang === 'url' ? tokeniseUrl(text) : [])
let copied = $state(false)
let copiedTimeout: ReturnType<typeof setTimeout> | undefined
const apiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)
const copyPath = $derived(
  text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join(''),
)
const copyText = $derived(`${apiBaseUrl}${copyPath}`)

async function copyUrl() {
  if (!navigator.clipboard) return

  try {
    await navigator.clipboard.writeText(copyText)
    copied = true
    if (copiedTimeout) clearTimeout(copiedTimeout)
    copiedTimeout = setTimeout(() => {
      copied = false
    }, 2_000)
  } catch {
    copied = false
  }
}
</script>

{#if lang === 'url'}
  <div
    class="relative m-0 overflow-x-auto border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 py-2 pr-8 font-mono text-sm leading-6"
  >
    <button
      class="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary"
      type="button"
      aria-label={copied ? m.common_copied() : m.common_copy()}
      title={copied ? m.common_copied() : m.common_copy()}
      onclick={copyUrl}
    >
      <Icon
        icon={copied ? 'ion:checkmark-outline' : 'ion:copy-outline'}
        class="size-4"
        aria-hidden="true"
      />
    </button>
    <code class="block before:content-none after:content-none">
      {#each tokens as line, lineIndex}
        {#if lineIndex === 0}
          <span
            class="mr-[2ch] inline-block w-[4ch] font-body text-label-sm font-black uppercase tracking-[0.12em] text-foreground-alt"
            >GET</span
          >
        {:else}
          <br>
          <span class="whitespace-pre" aria-hidden="true">{line.indent}</span>
        {/if}
        {#each line.tokens as token}
          <span
            class:font-semibold={token.kind === 'parameter'}
            class:text-orange-200={token.kind === 'family'}
            class:text-secondary-fixed={token.kind === 'parameter'}
            class:text-data-secondary={token.kind === 'value'}
            class:px-1={token.kind === 'separator' && token.value !== '?'}
            class:text-outline={token.kind === 'separator'}
            >{token.value}</span
          >
        {/each}
      {/each}
    </code>
  </div>
{:else}
  <pre class={lang}><code>{text}</code></pre>
{/if}
