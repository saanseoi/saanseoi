<script lang="ts">
import { defaultSanitizeUrl } from '@humanspeak/svelte-markdown'

type Props = {
  raw: string
  nested?: boolean
}

let { raw, nested = false }: Props = $props()

function parseCodeSpanLink(value: string) {
  const source = value.replaceAll('`', '')
  const match = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(source)
  if (!match?.[1] || !match[2]) return null

  const href = defaultSanitizeUrl(match[2], { type: 'link', tag: 'a' })
  return href ? { href, label: match[1] } : null
}

let codeLink = $derived(parseCodeSpanLink(raw))
</script>

{#if codeLink}
  <a
    class={`not-prose mx-0.75 inline-flex h-[1.35em] items-center rounded-sm bg-black px-1 py-0.5 font-body text-[0.78em] font-semibold leading-none text-white underline decoration-white/70 underline-offset-2 ${nested ? '' : '-translate-y-px'}`}
    href={codeLink.href}
    >{codeLink.label}</a
  >
{:else}
  <code
    class={`not-prose mx-0.75 inline-flex items-center rounded-sm border border-[#005142] bg-secondary-container/15 font-mono text-[0.78em] font-semibold leading-none text-secondary align-middle dark:border-[#2f8f78] ${nested ? 'px-1 py-0.5' : 'px-1 py-1'}`}
    >{raw.replaceAll('`', '')}</code
  >
{/if}
