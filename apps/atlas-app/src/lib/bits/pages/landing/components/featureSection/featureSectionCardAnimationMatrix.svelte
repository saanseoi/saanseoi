<script lang="ts">
const characters = '018F8A4D0C9B42E6'.split('')
const tiles = Array.from({ length: 144 }, (_, index) => ({
  char: characters[index % characters.length],
  horizontalIndex: index,
  verticalIndex: (index % 12) * 12 + Math.floor(index / 12),
}))
</script>

<span
  class="grid h-full grid-cols-12 auto-rows-[1.22rem] content-start gap-[.18rem] bg-[#164438] p-[.7rem] dark:bg-secondary/10"
>
  {#each tiles as tile}
    <span
      class="ticker-tile relative inline-flex items-center justify-center bg-[#205647] font-mono text-[.82rem] font-extrabold text-secondary-fixed/66 dark:bg-secondary/10 dark:text-[#8cf6da]/14"
      data-char={tile.char}
      style={`--horizontal-index: ${tile.horizontalIndex}; --vertical-index: ${tile.verticalIndex}`}
    >
      {tile.char}
      <span class="ticker-scan ticker-scan-horizontal" data-char={tile.char}></span>
      <span class="ticker-scan ticker-scan-vertical" data-char={tile.char}></span>
    </span>
  {/each}
</span>

<style>
.ticker-scan,
.ticker-scan::before {
  position: absolute;
  inset: 0;
}
.ticker-scan {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary);
  opacity: 0;
}
.ticker-scan::before {
  content: "";
  background: color-mix(in srgb, var(--secondary) 72%, transparent);
  opacity: 0;
  animation: ticker-background-flash 8.64s linear infinite;
}
.ticker-scan::after {
  position: relative;
  z-index: 1;
  content: attr(data-char);
}
.ticker-scan-horizontal {
  animation: ticker-character-fade 8.64s linear infinite;
  animation-delay: calc(var(--horizontal-index) * -90ms);
}
.ticker-scan-horizontal::before {
  animation-delay: calc(var(--horizontal-index) * -90ms);
}
.ticker-scan-vertical {
  animation: ticker-character-fade 5.76s linear infinite;
  animation-delay: calc(var(--vertical-index) * -72ms);
}
.ticker-scan-vertical::before {
  animation-delay: calc(var(--vertical-index) * -72ms);
}
@keyframes ticker-character-fade {
  0% {
    opacity: 1;
    color: #8cf6da;
  }
  33.333%,
  100% {
    opacity: 0;
    color: color-mix(in srgb, #8cf6da 14%, transparent);
  }
}
@keyframes ticker-background-flash {
  0% {
    opacity: 1;
  }
  16.666%,
  100% {
    opacity: 0;
  }
}
</style>
