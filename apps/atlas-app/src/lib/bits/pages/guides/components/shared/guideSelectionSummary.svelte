<script lang="ts">
type Props = {
  message: string
  selection: string
}

let { message, selection }: Props = $props()
</script>

<div class="px-6 py-5 text-center" aria-live="polite">
  <p class="font-display text-headline-sm font-bold text-primary">{@html message}</p>
  <p class="mt-2 font-display text-headline-lg font-bold text-secondary">
    {@html selection}
  </p>
</div>
