<g
  class="[&_circle]:fill-[color-mix(in_srgb,var(--secondary)_22%,transparent)] [&_circle]:opacity-50"
  aria-hidden="true"
>
  {#each Array.from({ length: 112 }) as _, index}
    <circle
      cx={(index * 97) % 1200}
      cy={(index * 53) % 760}
      r={index % 7 === 0 ? 1.2 : 0.65}
    />
  {/each}
</g>
