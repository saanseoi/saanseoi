<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

type Props = { isRevealed: boolean }
let { isRevealed }: Props = $props()
</script>

<header
  class={`relative z-0 block pb-6 transition-[opacity,translate] duration-500 ease-out ${isRevealed ? 'opacity-100 translate-y-0' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100'}`}
>
  <h2
    class="max-w-[15ch] font-display text-[clamp(2.25rem,4.05vw,4.2rem)] font-extrabold leading-[.92] text-primary"
  >
    {m.architecture_title()}
  </h2>
  <p
    class="mt-4 max-w-3xl font-body text-[clamp(1rem,1.4vw,1.14rem)] leading-[1.8] text-foreground-alt"
  >
    {m.architecture_description()}
  </p>
</header>
