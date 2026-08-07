<script lang="ts">
type Props = { image: string }
let { image }: Props = $props()
</script>

<span
  class="relative mb-4 block aspect-square w-full shrink-0 overflow-hidden rounded-[0.48rem] border-[0.09rem] border-[#fff9ed] bg-[#fff9ed] shadow-[0_0.35rem_0.9rem_rgb(0_0_0/0.16)]"
  aria-hidden="true"
>
  <img
    class="pointer-events-none block size-full origin-center object-cover scale-[1.12]"
    src={image}
    alt=""
    draggable="false"
  >
  <span
    class="pointer-events-none absolute inset-1.5 rounded-[0.38rem] border border-black/12"
    aria-hidden="true"
  ></span>
</span>
