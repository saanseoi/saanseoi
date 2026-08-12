<span
  class="absolute inset-0 bg-[#482719] text-[#ffb595] dark:bg-tertiary/13 dark:text-tertiary"
>
  <span></span><span></span><span></span>
</span>

<style>
span > span {
  position: absolute;
  inset: 35%;
  border: 2px solid currentColor;
  animation: hollow-grow 4.2s ease-in-out infinite;
}
span > span:nth-child(1) {
  animation-name: hollow-grow-wide;
}
span > span:nth-child(2) {
  animation-delay: -1.4s;
  animation-name: hollow-grow-tall;
  transform: rotate(45deg);
}
span > span:nth-child(3) {
  top: 50%;
  right: auto;
  bottom: auto;
  left: 50%;
  width: 42%;
  aspect-ratio: 1;
  border-radius: 999px;
  animation: enrichment-ring-pulse 3.6s ease-in-out infinite;
}
@keyframes hollow-grow-wide {
  0% {
    top: 42%;
    right: 36%;
    bottom: 42%;
    left: 36%;
    opacity: 0;
  }
  35% {
    opacity: 0.72;
  }
  100% {
    top: -18%;
    right: -8%;
    bottom: -18%;
    left: -8%;
    opacity: 0;
    transform: rotate(110deg);
  }
}
@keyframes hollow-grow-tall {
  0% {
    top: 38%;
    right: 44%;
    bottom: 38%;
    left: 44%;
    opacity: 0;
  }
  35% {
    opacity: 0.68;
  }
  100% {
    top: -10%;
    right: 8%;
    bottom: -10%;
    left: 8%;
    opacity: 0;
    transform: rotate(155deg);
  }
}
@keyframes hollow-grow {
  0% {
    top: 42%;
    right: 42%;
    bottom: 42%;
    left: 42%;
    opacity: 0;
  }
  35% {
    opacity: 0.72;
  }
  100% {
    top: -18%;
    right: -18%;
    bottom: -18%;
    left: -18%;
    opacity: 0;
    transform: rotate(110deg);
  }
}
@keyframes enrichment-ring-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(0.92);
  }
  50% {
    opacity: 0.95;
    transform: translate(-50%, -50%) scale(1.04);
  }
}
</style>
