<script lang="ts">
import Button from '../button.svelte'

type Props = {
  class?: string
  href: string
  text: string
}

let { class: className = '', href, text }: Props = $props()
</script>

<Button
  class={`hidden min-h-11 rounded-none px-6 text-body-md font-medium tracking-[-0.01em] text-nowrap mobile:inline-flex ${className}`.trim()}
  {href}
  variant="primary"
>
  {text}
</Button>
