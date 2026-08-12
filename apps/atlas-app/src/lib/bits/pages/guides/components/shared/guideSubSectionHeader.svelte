<script lang="ts">
type Props = {
  eyebrow: string
  title: string
}

let { eyebrow, title }: Props = $props()
</script>

<p
  class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
>
  {@html eyebrow}
</p>
<h3 class="mt-1 font-display text-headline-md leading-tight font-bold text-primary">
  {@html title}
</h3>
