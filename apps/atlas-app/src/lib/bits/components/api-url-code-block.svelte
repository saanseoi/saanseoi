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
  kind:
    | 'path'
    | 'version'
    | 'family'
    | 'separator'
    | 'parameter'
    | 'parameterQualifier'
    | 'bracket'
    | 'value'
  value: string
}

type UrlLine = {
  indent: string
  tokens: UrlToken[]
}

function tokenisePath(value: string): UrlToken[] {
  const platformMatch = /^(\/v[^/]+)(\/[^/?]+)?(.*)$/.exec(value)
  if (platformMatch) {
    const [, version = '', family, rest = ''] = platformMatch
    const tokens: UrlToken[] = [{ kind: 'version', value: version }]

    if (family) tokens.push({ kind: 'family', value: family })
    if (rest) tokens.push({ kind: 'path', value: rest })

    return tokens
  }

  const familyMatch = /^(\/[^/?]+)(\/v[^/]+)(.*)$/.exec(value)
  if (familyMatch) {
    const [, family = '', version = '', rest = ''] = familyMatch
    const tokens: UrlToken[] = [
      { kind: 'family', value: family },
      { kind: 'version', value: version },
    ]

    if (rest) tokens.push({ kind: 'path', value: rest })
    return tokens
  }

  return [{ kind: 'path', value }]
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

function tokeniseParameter(value: string): UrlToken[] {
  const match = /^(.*?)(\[)([^\]]+)(\])$/.exec(value)
  if (!match) return [{ kind: 'parameter', value }]

  const [, name = '', openingBracket = '', qualifier = '', closingBracket = ''] = match
  return [
    { kind: 'parameter', value: name },
    { kind: 'bracket', value: openingBracket },
    { kind: 'parameterQualifier', value: qualifier },
    { kind: 'bracket', value: closingBracket },
  ]
}

function tokeniseQuery(query: string): UrlToken[] {
  const tokens: UrlToken[] = []
  for (const [index, parameter] of query.split('&').entries()) {
    if (index > 0) tokens.push({ kind: 'separator', value: '&' })

    const equalsIndex = parameter.indexOf('=')
    if (equalsIndex === -1) {
      tokens.push(...tokeniseParameter(parameter))
      continue
    }

    tokens.push(...tokeniseParameter(parameter.slice(0, equalsIndex)))
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
function getCopyPaths(value: string) {
  const paths: string[] = []
  let pathParts: string[] = []

  for (const line of value.split(/\r?\n/)) {
    const part = line.trim()
    if (!part) continue

    if (part.startsWith('/')) {
      if (pathParts.length > 0) paths.push(pathParts.join(''))
      pathParts = [part]
      continue
    }

    pathParts.push(part)
  }

  if (pathParts.length > 0) paths.push(pathParts.join(''))
  return paths
}

const copyPaths = $derived(getCopyPaths(text))
const copyText = $derived(
  copyPaths
    .map(path => `${apiBaseUrl}${path.replaceAll('[', '%5B').replaceAll(']', '%5D')}`)
    .join('\n'),
)

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
    class="relative m-0 overflow-x-auto border border-data-outline-variant/60 bg-primary py-2 pl-6 font-mono text-sm leading-6 text-on-primary dark:bg-data-surface-container-lowest dark:text-data-on-surface"
  >
    <button
      class="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full text-on-primary/70 transition hover:bg-primary-container hover:text-on-primary dark:text-data-on-surface-variant dark:hover:bg-data-surface-container-high dark:hover:text-data-primary"
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
            class="mr-3 inline-block w-[4ch] font-body text-xs leading-none font-black! uppercase tracking-[0.12em] text-on-primary dark:text-data-on-surface"
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
            class:text-primary-fixed={token.kind === 'version'}
            class:text-secondary-fixed={token.kind === 'parameter'}
            class:text-blue-300={token.kind === 'parameterQualifier'}
            class:text-data-warning={token.kind === 'value'}
            class:px-1={token.kind === 'separator' && token.value !== '?'}
            class:text-primary-fixed-dim={token.kind === 'bracket' || token.kind === 'separator'}
            >{token.value}</span
          >
        {/each}
      {/each}
    </code>
  </div>
{:else}
  <pre class={lang}><code>{text}</code></pre>
{/if}
