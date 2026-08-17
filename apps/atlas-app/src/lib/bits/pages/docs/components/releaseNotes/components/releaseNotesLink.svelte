<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import type { Snippet } from 'svelte'

import type {
  ReleaseNotesLabels,
  ReleaseNotesTransclusion,
} from '../releaseNotes.types'
import ReleaseNotesTransclusionComponent from './releaseNotesTransclusion.svelte'

type Props = {
  href?: string | null
  title?: string | null
  labels: ReleaseNotesLabels
  transclusions: Record<string, ReleaseNotesTransclusion>
  children?: Snippet
}

let { href, title, labels, transclusions, children }: Props = $props()
let transclusion = $derived(href ? transclusions[href] : undefined)

const isExternalDocumentLink = (value: string | null | undefined) =>
  /^https?:\/\//i.test(value ?? '')
const isApiDocumentationLink = (value: string | null | undefined) =>
  /^\/docs(?:[/?#]|$)/.test(value ?? '')
</script>

{#if transclusion}
  <ReleaseNotesTransclusionComponent {transclusion} {labels} {transclusions} {title}>
    {@render children?.()}
  </ReleaseNotesTransclusionComponent>
{:else if isApiDocumentationLink(href)}
  <a
    class="mx-0.75 inline-flex items-baseline gap-0.5 font-mono text-blue-700 underline decoration-blue-400/60 underline-offset-4 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
    {href}
    {title}
  >
    {@render children?.()}
    <Icon
      icon="material-symbols-light:api-rounded"
      class="size-[1em] shrink-0"
      aria-hidden="true"
    />
  </a>
{:else if isExternalDocumentLink(href)}
  <a
    class="mx-0.75 inline-flex items-baseline gap-1"
    {href}
    {title}
    target="_blank"
    rel="noopener noreferrer"
  >
    {@render children?.()}
    <Icon icon="ion:open-outline" class="size-[0.9em] shrink-0" aria-hidden="true" />
  </a>
{:else}
  <a {href} {title}>{@render children?.()}</a>
{/if}
