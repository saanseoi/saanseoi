<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  hasContent: boolean
  sourceTableColumns?: boolean
  element?: HTMLElement
  children?: Snippet
}

let {
  hasContent,
  sourceTableColumns = false,
  element = $bindable(),
  children,
}: Props = $props()
</script>

<article
  bind:this={element}
  data-release-nav-content-body
  class={`prose prose-neutral max-w-none scroll-mt-24 overflow-visible py-6 prose-pre:border prose-pre:border-[#5b5b57] prose-pre:bg-[#353532] prose-pre:text-[#e5e2de] prose-pre:shadow-none [&_h2+h2]:mt-[calc(2em-8px)] [&_table_a]:decoration-foreground/35 [&_table_a]:decoration-dotted [&_table_a]:decoration-1 [&_table_a]:underline-offset-4 [&_table_a]:transition-[text-decoration-color] [&_table_a:hover]:decoration-foreground/75 [&_table_a:hover]:decoration-solid [&_table_a:focus-visible]:decoration-foreground/90 [&_table_a:focus-visible]:decoration-solid lg:h-full lg:min-h-0 lg:max-h-none lg:overflow-y-auto lg:overscroll-contain lg:p-6 lg:pt-12 lg:scroll-mt-[120px] dark:prose-invert ${sourceTableColumns ? '[&_table]:w-full [&_table]:table-fixed [&_table_th:first-child]:w-[42%] [&_table_th:last-child]:w-[22%]' : ''} ${hasContent ? 'lg:pb-6' : ''}`}
>
  {@render children?.()}
</article>
