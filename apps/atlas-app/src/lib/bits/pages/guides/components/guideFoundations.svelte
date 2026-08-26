<script lang="ts">
type Foundation = {
  description: string
  href: string
  image: string
  title: string
}

type Props = {
  description: string
  items: Foundation[]
  title: string
}

let { description, items, title }: Props = $props()
</script>

<section class="mt-8" aria-labelledby="map-foundations-heading">
  <h2
    id="map-foundations-heading"
    class="font-display text-headline-md font-bold text-primary"
  >
    {@html title}
  </h2>
  <p class="mt-3 font-body text-body-lg leading-8 text-foreground-alt">
    {@html description}
  </p>
  <ol class="mt-8 flex flex-col gap-2 md:gap-3">
    {#each items as item, index}
      <li
        class={`w-full md:w-3/5 ${index % 2 === 1 ? 'md:self-end' : 'md:self-start'}`}
      >
        <a
          class={`group grid gap-3 md:items-center ${index % 2 === 1 ? 'md:grid-cols-[1fr_9rem]' : 'md:grid-cols-[9rem_1fr]'}`}
          href={item.href}
        >
          <div
            class={`relative flex h-32 items-center justify-center md:h-36 ${index % 2 === 1 ? 'md:order-2' : ''}`}
          >
            <img
              class="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.04]"
              src={item.image}
              alt=""
            >
          </div>
          <div
            class={`relative border-t border-border-card pt-5 group-hover:border-secondary ${index % 2 === 1 ? 'md:order-1' : ''}`}
          >
            <span
              class="absolute -top-5 left-0 grid size-10 place-items-center bg-secondary font-body text-label-md font-bold text-on-secondary"
              >{index + 1}</span
            >
            <h3 class="pt-2 font-display text-headline-md font-bold text-primary">
              {@html item.title}
            </h3>
            <p class="mt-1 font-body text-body-sm leading-6 text-foreground-alt">
              {@html item.description}
            </p>
          </div>
        </a>
      </li>
    {/each}
  </ol>
</section>
