<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  class?: string
  children?: Snippet
  content?: string
  contentClass?: string
}

let { class: className = '', children, content, contentClass = '' }: Props = $props()
</script>

<div class={`${content ? 'mt-3' : 'mt-6'} max-w-232 space-y-5 ${className}`}>
  {#if content}
    <p
      class={`font-body text-body-lg leading-8 text-foreground-alt [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code.guide-urban-density-metrics]:text-secondary [&_kbd]:mx-1 [&_kbd]:inline-flex [&_kbd]:min-h-[1.55em] [&_kbd]:items-center [&_kbd]:justify-center [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-secondary/65 [&_kbd]:border-b-2 [&_kbd]:bg-secondary-container [&_kbd]:px-[0.35em] [&_kbd]:align-[0.06em] [&_kbd]:font-mono [&_kbd]:text-[0.78em] [&_kbd]:font-bold [&_kbd]:leading-none [&_kbd]:text-white [&_kbd]:shadow-kbd ${contentClass}`}
    >
      {@html content}
    </p>
  {/if}
  {@render children?.()}
</div>
