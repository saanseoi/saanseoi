<script lang="ts">
import { Dialog } from 'bits-ui'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

type Props = {
  open: boolean
}

let { open: isOpen = $bindable() }: Props = $props()
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-80 bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-90 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border border-border-card bg-background p-6 shadow-popover focus:outline-none"
    >
      <Dialog.Title class="font-display text-headline-sm font-bold text-primary">
        {@html m.guide_basemap_account_modal_title()}
      </Dialog.Title>
      <Dialog.Description
        class="mt-3 font-body text-body-md leading-7 text-foreground-alt"
      >
        {@html m.guide_basemap_account_modal_body()}
      </Dialog.Description>
      <div class="mt-6 flex flex-wrap gap-3">
        <Button
          href="/sign-up?continue=/guides/create-a-map%23basemap"
          variant="primary"
        >
          {@html m.guide_basemap_account_modal_continue()}
        </Button>
        <Button onclick={() => (isOpen = false)} variant="secondary"
          >{m.common_cancel()}</Button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
