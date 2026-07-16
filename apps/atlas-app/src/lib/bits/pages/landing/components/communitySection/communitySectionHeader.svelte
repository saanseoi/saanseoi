<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

type Props = { element?: HTMLElement }
let { element = $bindable() }: Props = $props()
</script>

<header class="landing-section-header relative z-1 block pb-0" bind:this={element}>
  <h2
    class="max-w-[15ch] font-display text-[clamp(2.25rem,4.05vw,4.2rem)] font-extrabold leading-[.92] text-primary"
  >
    {m.newsletter_title()}
  </h2>
  <p
    class="mt-4 max-w-4xl font-body text-[clamp(1rem,1.4vw,1.14rem)] leading-[1.8] text-foreground-alt"
  >
    {m.newsletter_description()}
  </p>
</header>
