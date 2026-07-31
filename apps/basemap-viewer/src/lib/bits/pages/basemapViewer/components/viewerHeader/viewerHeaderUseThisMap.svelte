<script lang="ts">
import type { ViewerText } from '../../i18n'

let { text }: { text: ViewerText } = $props()

const saanseoiBaseUrl = import.meta.env.DEV
  ? 'http://localhost:5173'
  : 'https://saanseoi.hk'
const gettingStartedUrl = new URL('/tiles/getting-started', saanseoiBaseUrl).href
</script>

<a
  class="inline-flex h-[28px] shrink-0 items-center rounded-[5px] border border-(--bar-accent) bg-(--bar-accent) px-2.5 font-mono text-[10px] font-semibold leading-none tracking-[0.02em] text-white uppercase transition-[filter,background-color] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2"
  href={gettingStartedUrl}
>
  {text.useThisMap}
</a>
