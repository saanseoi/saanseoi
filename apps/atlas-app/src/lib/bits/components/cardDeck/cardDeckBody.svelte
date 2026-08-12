<script lang="ts">
import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  title: string
  body?: string
  class?: string
  titleClass?: string
  bodyClass?: string
}

let {
  title,
  body,
  class: className = '',
  titleClass = '',
  bodyClass = '',
}: Props = $props()
</script>

<span class={cn(className)}>
  <span class={cn(titleClass)}>{title}</span>
  {#if body}
    <span class={cn(bodyClass)}>{body}</span>
  {/if}
</span>
