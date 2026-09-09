<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { Tooltip } from 'bits-ui'
import Sparkle from '@iconify-svelte/proicons/sparkle'
import Person from '@iconify-svelte/proicons/person'
import Info from '@iconify-svelte/proicons/info'
let { origin }: { origin: string } = $props()
let explanation = $derived(
  origin === 'human-translated'
    ? m.source_audit_human_translation_explanation()
    : origin === 'ai-translated'
      ? m.source_audit_ai_translation_explanation()
      : m.source_audit_translation_origin_missing(),
)
</script>
<Tooltip.Provider delayDuration={150}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          aria-label={origin === 'human-translated' ? m.source_audit_human_translation_origin() : origin === 'ai-translated' ? m.source_audit_ai_translation_origin() : m.source_audit_unrecorded_translation_origin()}
          class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-current/60 hover:bg-current/10 hover:text-current"
          onclick={event => event.stopPropagation()}
        >
          {#if origin === 'human-translated'}
            <Person class="size-6" />
          {:else if origin === 'ai-translated'}
            <Sparkle class="size-6" />
          {:else}
            <Info class="size-6" />
          {/if}
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal
      ><Tooltip.Content
        role="tooltip"
        side="top"
        sideOffset={8}
        class="z-70 max-w-64 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 text-xs text-foreground shadow-popover"
        >{explanation}</Tooltip.Content
      ></Tooltip.Portal
    >
  </Tooltip.Root>
</Tooltip.Provider>
