<script lang="ts">
const metrics = [
  { name: 'Hong Kong', value: '29,400', width: 'w-[84%]' },
  { name: 'Kowloon', value: '47,800', width: 'w-[96%]' },
  { name: 'New Territories', value: '7,200', width: 'w-[42%]' },
]
</script>

<div
  class="overflow-hidden border border-[#596074] bg-[#d7e6dc] font-body text-[#1c302b] shadow-inner"
>
  <div class="relative h-52 overflow-hidden bg-[#bdd3ca] sm:h-64">
    <div
      class="absolute inset-0 opacity-55 [background-image:linear-gradient(28deg,transparent_48%,#fff9ed_49%_51%,transparent_52%),linear-gradient(126deg,transparent_47%,#fff9ed_48%_50%,transparent_51%),linear-gradient(168deg,transparent_48%,#fff9ed_49%_51%,transparent_52%)] [background-size:11rem_8rem,9rem_7rem,13rem_10rem]"
      aria-hidden="true"
    ></div>
    <div
      class="absolute top-[14%] left-[10%] h-[42%] w-[32%] rotate-[-10deg] rounded-[45%_55%_46%_54%] border-2 border-[#732f20] bg-[#d65332]/60 shadow-[0_0_0_0.4rem_rgb(214_83_50_/_0.14)]"
      aria-hidden="true"
    ></div>
    <div
      class="absolute top-[26%] left-[44%] h-[38%] w-[24%] rotate-[17deg] rounded-[52%_48%_38%_62%] border-2 border-[#732f20] bg-[#d65332]/60 shadow-[0_0_0_0.4rem_rgb(214_83_50_/_0.14)]"
      aria-hidden="true"
    ></div>
    <div
      class="absolute top-[12%] right-[8%] h-[48%] w-[25%] rotate-[6deg] rounded-[58%_42%_52%_48%] border-2 border-[#732f20] bg-[#d65332]/60 shadow-[0_0_0_0.4rem_rgb(214_83_50_/_0.14)]"
      aria-hidden="true"
    ></div>
    <p
      class="absolute top-3 left-3 rounded-sm bg-[#fff9ed]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] uppercase shadow-sm"
    >
      Urban land
    </p>
    <p
      class="absolute right-3 bottom-3 rounded-sm bg-[#1d2b29]/85 px-2 py-1 font-mono text-[0.68rem] text-white/80 shadow-sm"
    >
      SaanSeoi basemap
    </p>
  </div>
  <section
    class="grid divide-y divide-[#26433d]/35 bg-[#fff9ed] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    aria-label="Urban population density"
  >
    {#each metrics as metric}
      <article class="p-4">
        <p class="text-label-sm font-semibold text-[#53645e]">{metric.name}</p>
        <strong class="mt-1 block text-2xl leading-none">{metric.value}</strong>
        <span class="mt-1 block text-xs text-[#53645e]">people per km²</span>
        <span
          class={`mt-3 block h-1.5 rounded-full bg-[#d65332] ${metric.width}`}
        ></span>
      </article>
    {/each}
  </section>
</div>
