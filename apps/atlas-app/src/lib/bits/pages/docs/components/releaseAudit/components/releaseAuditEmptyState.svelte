<script lang="ts">
import Icon from '@iconify/svelte'

type Props = { message: string }

let { message }: Props = $props()
</script>

<div
  class="mt-6 flex gap-3 border border-data-outline-variant/60 bg-data-surface-container-low p-4 font-body text-body-md text-foreground-alt"
>
  <Icon
    icon="proicons:search"
    class="mt-0.5 size-5 shrink-0 text-data-secondary"
    aria-hidden="true"
  />
  <p>{message}</p>
</div>
