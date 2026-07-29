<script lang="ts">
type Props = {
  resultCount: string
}

let { resultCount }: Props = $props()
</script>

<p class="text-right font-body text-body-sm text-foreground-alt" aria-live="polite">
  {resultCount}
</p>
