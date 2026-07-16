<script lang="ts">
const nodes: Array<[number, number, number]> = [
  [36, 92, 6],
  [136, 54, 5],
  [142, 116, 5],
  [212, 40, 4],
  [218, 64, 4],
  [116, 92, 3.5],
  [196, 92, 6],
  [300, 118, 5],
  [384, 124, 4],
  [260, 92, 3.5],
  [328, 92, 6],
  [436, 56, 5],
  [520, 42, 4],
  [526, 66, 4],
  [420, 92, 3.5],
  [500, 92, 6],
  [610, 118, 5],
  [588, 92, 6],
  [676, 64, 5],
]
</script>

<svg
  class="absolute inset-0 h-full w-[200%] bg-[#164438] text-secondary-fixed dark:bg-secondary/10 dark:text-[#8cf6da]"
  viewBox="0 0 640 150"
  aria-hidden="true"
>
  <defs>
    <g id="provenance-branch">
      <path class="branch-curve branch-baseline" d="M-42 92 H682" />
      <path class="branch-curve" d="M36 92 C70 58 98 50 136 54" />
      <path class="branch-curve" d="M36 92 C72 118 102 122 142 116" />
      <path class="branch-curve branch-secondary" d="M136 54 C160 36 184 34 212 40" />
      <path class="branch-curve branch-secondary" d="M136 54 C164 66 188 70 218 64" />
      <path class="branch-curve" d="M196 92 C230 120 258 126 300 118" />
      <path
        class="branch-curve branch-secondary"
        d="M300 118 C330 132 354 132 384 124"
      />
      <path class="branch-curve" d="M328 92 C366 58 394 50 436 56" />
      <path class="branch-curve branch-secondary" d="M436 56 C462 38 488 36 520 42" />
      <path class="branch-curve branch-secondary" d="M436 56 C466 68 492 72 526 66" />
      <path class="branch-curve" d="M500 92 C536 120 566 126 610 118" />
      <path class="branch-curve" d="M588 92 C620 66 644 60 676 64" />
      {#each nodes as node}
        <circle class="branch-node" cx={node[0]} cy={node[1]} r={node[2]} />
      {/each}
    </g>
  </defs>
  <g class="branch-loop">
    <use href="#provenance-branch"></use>
    <use href="#provenance-branch" x="640"></use>
  </g>
</svg>

<style>
.branch-loop {
  transform-origin: center;
  animation: branch-scroll 5.6s linear infinite;
}
.branch-curve {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.62;
}
.branch-baseline {
  opacity: 0.5;
}
.branch-secondary {
  opacity: 0.42;
}
.branch-node {
  fill: currentColor;
  filter: drop-shadow(0 0 0.28rem color-mix(in srgb, currentColor 45%, transparent));
  opacity: 0.9;
}
@keyframes branch-scroll {
  0% {
    transform: translateX(0);
    opacity: 0.38;
  }
  10%,
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translateX(-640px);
    opacity: 0.38;
  }
}
</style>
