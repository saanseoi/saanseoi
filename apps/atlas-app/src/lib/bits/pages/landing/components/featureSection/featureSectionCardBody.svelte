<script lang="ts">
type Props = { body: string; tone: 'paper' | 'dark'; isActive: boolean }

let { body, tone, isActive }: Props = $props()
</script>

<span
  class={`principle-card-body mt-4 block max-h-0 pointer-events-none opacity-0 transition-[max-height,opacity] duration-450 ${
    isActive ? 'max-h-none pointer-events-auto opacity-100' : ''
  } ${tone === 'paper' ? 'text-[#444748] dark:text-foreground-alt' : 'text-foreground-alt'}`}
>
  {body}
</span>
