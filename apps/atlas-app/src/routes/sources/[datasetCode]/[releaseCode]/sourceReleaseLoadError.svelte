<script lang="ts">
import { Button } from '#lib/bits/primitives/button/index.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  message: string
  onRetry: () => void
  retryLabel: string
}

let { message, onRetry, retryLabel }: Props = $props()
</script>

<section
  class="flex min-h-72 w-full items-center justify-center rounded-lg border border-data-warning/45 bg-data-warning/10 px-6 py-12 text-center"
  role="alert"
>
  <div class="flex max-w-md flex-col items-center">
    <span
      class="flex size-14 items-center justify-center rounded-full bg-data-warning/20 text-data-secondary"
    >
      <Icon
        icon="material-symbols-light:warning-rounded"
        class="size-8"
        aria-hidden="true"
      />
    </span>
    <p class="mt-5 font-body text-body-lg font-semibold text-foreground">{message}</p>
    <Button
      class="mt-6"
      onclick={onRetry}
      size="compact"
      type="button"
      variant="secondary"
    >
      {retryLabel}
    </Button>
  </div>
</section>
