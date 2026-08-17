<script lang="ts">
import type { Component } from 'svelte'
import IconProiconsQuestion from '@iconify-svelte/proicons/question'

import { localIconComponents } from './iconComponents'

type Props = {
  icon: string
  [key: string]: string
}

let { icon, ...props }: Props = $props()
let LocalIcon = $derived(
  localIconComponents[icon as keyof typeof localIconComponents] as unknown as
    | Component<Record<string, string>>
    | undefined,
)
</script>

{#if LocalIcon}
  <LocalIcon {...props} />
{:else}
  <IconProiconsQuestion {...props} />
{/if}
