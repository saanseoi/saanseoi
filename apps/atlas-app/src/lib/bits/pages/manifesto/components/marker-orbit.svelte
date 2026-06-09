<script lang="ts">
import Icon from '@iconify/svelte'
</script>

<div class="hidden md:col-span-4 md:flex md:items-center md:justify-center">
  <div class="relative size-48 shrink-0 text-secondary">
    <div
      class="manifesto-orbit absolute inset-0 rounded-full border border-dashed border-secondary/35"
    ></div>
    <div
      class="absolute inset-[1.15rem] rounded-full border border-secondary/18"
      aria-hidden="true"
    ></div>
    <div
      class="manifesto-orbit-accent absolute inset-[0.4rem] rounded-full border border-secondary/12"
      aria-hidden="true"
    ></div>

    <div class="absolute inset-0 flex items-center justify-center">
      <div
        class="manifesto-marker-pulse flex h-30 w-30 items-center justify-center rounded-full border border-secondary/20 bg-secondary/8"
      >
        <span class="manifesto-marker flex items-center justify-center">
          <Icon icon="proicons:location" class="size-10" />
        </span>
      </div>
    </div>
  </div>
</div>

<style>
.manifesto-orbit {
  animation: manifesto-orbit-spin 16s linear infinite;
  transform-origin: center;
}

.manifesto-orbit-accent {
  animation: manifesto-orbit-spin 22s linear infinite reverse;
  transform-origin: center;
}

.manifesto-marker-pulse {
  animation: manifesto-marker-pulse 2.4s ease-in-out infinite;
}

.manifesto-marker {
  animation: manifesto-marker-bob 2.4s ease-in-out infinite;
}

@keyframes manifesto-orbit-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes manifesto-marker-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgb(111 217 190 / 0.2);
  }

  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 18px rgb(111 217 190 / 0);
  }
}

@keyframes manifesto-marker-bob {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(0, -3px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .manifesto-orbit,
  .manifesto-orbit-accent,
  .manifesto-marker-pulse,
  .manifesto-marker {
    animation: none;
  }
}
</style>
