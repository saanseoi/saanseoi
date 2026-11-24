<script lang="ts">
import { Popover } from 'bits-ui'

import { getCurrentLocale } from '#lib/bits/internal/i18n.js'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from '#lib/registry/referenceDocs.js'

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
        class="font-inherit text-secondary hover:text-primary font-semibold underline decoration-dotted underline-offset-4"
        type="button"
        aria-label={getMarkdownTransclusionDisplayTitle(definition, locale)}
      >
        {@html label}
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="rounded-default border-border-card/60 bg-background-alt font-body text-label-sm text-foreground shadow-popover z-70 max-w-80 border px-3 py-2"
      side="bottom"
      sideOffset={8}
      collisionPadding={{ right: 16 }}
      >{@html definition?.markdown ?? ''}</Popover.Content
    >
  </Popover.Portal>
</Popover.Root>
