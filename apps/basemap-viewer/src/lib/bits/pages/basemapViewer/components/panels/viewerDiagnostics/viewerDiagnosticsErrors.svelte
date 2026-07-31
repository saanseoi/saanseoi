<script lang="ts">
import type { ViewerText } from '../../../i18n'

let { errors, text }: { errors: string[]; text: ViewerText } = $props()
</script>

<section class="grid gap-1 border-t border-(--bar-divider) pt-2 text-[#b42318]">
  <h3 class="m-0 text-[11px] font-bold uppercase tracking-[0.06em]">
    {text.recentErrors}
  </h3>
  {#each errors as error}
    <span>{error}</span>
  {/each}
</section>
