<script lang="ts">
import type { Component } from 'svelte'
import IconProiconsQuestion from '@iconify-svelte/proicons/question'

import { localIconComponents } from './iconComponents'

type Props = {
  icon: string
  [key: string]: unknown
}

let { icon, ...props }: Props = $props()
let LocalIcon = $derived(
  localIconComponents[icon as keyof typeof localIconComponents] as
    | Component<Record<string, unknown>>
    | undefined,
)
</script>

{#if LocalIcon}
  <LocalIcon {...props} />
{:else}
  <IconProiconsQuestion {...props} />
{/if}
