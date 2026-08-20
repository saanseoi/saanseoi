<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  hasContent: boolean
  element?: HTMLElement
  children?: Snippet
}

let { hasContent, element = $bindable(), children }: Props = $props()
</script>

<article
  bind:this={element}
  data-release-nav-content-body
  class={`prose prose-neutral max-w-none scroll-mt-24 overflow-visible py-6 prose-pre:border prose-pre:border-outline-variant/60 prose-pre:bg-surface-container-high prose-pre:text-primary prose-pre:shadow-none [&_h2+h2]:mt-[calc(2em-8px)] [&_table_a]:decoration-foreground/35 [&_table_a]:decoration-dotted [&_table_a]:decoration-1 [&_table_a]:underline-offset-4 [&_table_a]:transition-[text-decoration-color] [&_table_a:hover]:decoration-foreground/75 [&_table_a:hover]:decoration-solid [&_table_a:focus-visible]:decoration-foreground/90 [&_table_a:focus-visible]:decoration-solid lg:h-full lg:min-h-0 lg:max-h-none lg:overflow-y-auto lg:overscroll-contain lg:p-6 lg:pt-12 lg:scroll-mt-[120px] dark:prose-invert dark:prose-pre:border-outline-variant dark:prose-pre:bg-surface-container-highest dark:prose-pre:text-primary ${hasContent ? 'lg:pb-6' : ''}`}
>
  {@render children?.()}
</article>
