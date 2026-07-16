<span class="grid h-full grid-cols-4 gap-1 bg-[#482719] p-2 dark:bg-tertiary/18">
  {#each Array.from({ length: 16 }) as _, cubeIndex}
    <span
      class="relative z-1 bg-[color-mix(in_srgb,var(--tertiary-fixed-dim)_72%,#5a2b1a)] dark:bg-[color-mix(in_srgb,var(--tertiary)_72%,var(--surface-container))]"
      style={`--cube-index: ${cubeIndex}`}
    ></span>
  {/each}
</span>

<style>
span::before {
  position: absolute;
  inset: 0.5rem;
  content: "";
  border: 1px solid color-mix(in srgb, var(--tertiary-fixed-dim) 48%, transparent);
  opacity: 0.36;
  animation: persistence-frame 4s ease-in-out infinite;
}
span > span {
  transform-origin: center;
  animation: cube-contort-restore 4s ease-in-out infinite;
  animation-delay: calc(var(--cube-index) * 28ms);
}
@keyframes cube-contort-restore {
  0%,
  12%,
  70%,
  100% {
    transform: translate3d(0, 0, 0);
    opacity: 0.84;
  }
  46% {
    transform: skew(-7deg, 2deg) rotate(calc((var(--cube-index) - 8) * 0.4deg));
    opacity: 0.56;
  }
  54% {
    transform: skew(9deg, -3deg) rotate(calc((8 - var(--cube-index)) * 0.28deg));
    opacity: 0.96;
  }
}
@keyframes persistence-frame {
  0%,
  100% {
    opacity: 0.5;
  }
  45% {
    opacity: 0.18;
    transform: scale(0.985);
  }
}
</style>
