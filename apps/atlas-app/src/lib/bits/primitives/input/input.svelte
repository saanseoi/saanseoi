<script lang="ts">
import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  class?: string
  id?: string
  name?: string
  placeholder?: string
  type?: string
  value?: string
}

let {
  class: className = '',
  id,
  name,
  placeholder,
  type = 'text',
  value = '',
}: Props = $props()
</script>

<input
  class={cn(
    'min-h-12 w-full border-b border-border-input bg-transparent px-4 font-body text-body-md text-foreground outline-none transition-colors placeholder:text-foreground-alt/70 focus:border focus:border-accent-foreground',
    className
  )}
  {id}
  {name}
  {placeholder}
  {type}
  {value}
>
