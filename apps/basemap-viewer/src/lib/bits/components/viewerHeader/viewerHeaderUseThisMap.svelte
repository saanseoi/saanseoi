<script lang="ts">
import type { ViewerText } from '../../pages/basemapViewer/i18n'
import type { Theme } from '../../../types'

let {
  text,
  theme,
  ghost = false,
}: { text: ViewerText; theme: Theme; ghost?: boolean } = $props()

const saanseoiBaseUrl = import.meta.env.DEV
  ? 'http://localhost:5173'
  : 'https://saanseoi.hk'
const gettingStartedUrl = new URL('/guides/create-a-map', saanseoiBaseUrl).href
</script>

<a
  class={`inline-flex h-[28px] shrink-0 items-center rounded-[5px] text-[10px] font-semibold leading-none tracking-[0.02em] uppercase transition-[filter,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 ${ghost ? `border border-transparent px-2 font-[Caveat] text-[17px] font-bold normal-case tracking-[-0.04em] ${theme === 'light' ? 'text-[#006c49]' : 'text-[#4edea3]'} hover:bg-(--bar-hover-background)` : `border border-(--bar-accent) bg-(--bar-accent) px-2.5 font-mono hover:brightness-110 ${theme === 'light' ? 'text-white' : 'text-black'}`}`}
  href={gettingStartedUrl}
>
  {text.useThisMap}
</a>
