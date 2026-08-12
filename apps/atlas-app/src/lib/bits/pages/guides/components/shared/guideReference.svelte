<script lang="ts">
import { Popover } from 'bits-ui'

import { getCurrentLocale } from '$lib/bits/internal/i18n'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from '$lib/registry/referenceDocs'

type Props = {
  href: string
  label: string
}

let { href, label }: Props = $props()
let locale = $derived(getCurrentLocale())
let definition = $derived(getMarkdownTransclusion(href))
</script>

<Popover.Root>
  <Popover.Trigger openOnHover openDelay={180}>
    {#snippet child({ props })}
      <button
        {...props}
        class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
        type="button"
        aria-label={getMarkdownTransclusionDisplayTitle(definition, locale)}
      >
        {@html label}
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="z-70 max-w-80 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
      side="bottom"
      sideOffset={8}
      collisionPadding={{ right: 16 }}
      >{@html definition?.markdown ?? ''}</Popover.Content
    >
  </Popover.Portal>
</Popover.Root>
