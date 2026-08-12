<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section
  class={cn(
    'landing-community-section min-h-[calc(100svh-var(--landing-header-height,4.5rem))]',
    className,
  )}
>
  {@render children?.()}
</section>

<style>
:global {
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature::after,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-packet,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-packet-fragment {
    animation-play-state: paused;
  }

  .newsletter-panel {
    /* Keep this at 4s while iterating; set it to 12s for the production cadence. */
    --newsletter-orange-cycle: 30s;
    /* Keep the existing route aligned to the content after expanding its corridors. */
    --newsletter-orange-y-shift-15: clamp(1.001rem, 2.156vw, 1.848rem);
    --newsletter-orange-y-shift-negative-3: clamp(1.516rem, 3.265vw, 2.798rem);
    --newsletter-orange-y-shift-14-6: clamp(1.012rem, 2.181vw, 1.869rem);
    --newsletter-orange-y-shift-14-5: clamp(1.015rem, 2.187vw, 1.874rem);
    --newsletter-orange-y-shift-67: clamp(-0.898rem, -1.047vw, -0.486rem);
    --newsletter-orange-y-shift-58: clamp(-0.422rem, -0.493vw, -0.229rem);
    --newsletter-orange-y-shift-45: clamp(0.143rem, 0.308vw, 0.264rem);
    --newsletter-orange-y-shift-43: clamp(0.2rem, 0.431vw, 0.37rem);
    --newsletter-orange-y-shift-30: clamp(0.572rem, 1.232vw, 1.056rem);
    --newsletter-orange-y-shift-11: clamp(1.115rem, 2.402vw, 2.059rem);
    --newsletter-orange-text-alignment: 1.25rem;
    --newsletter-orange-initial-hop-alignment: 1.25rem;
    --newsletter-orange-floor-alignment: 4rem;
    --newsletter-orange-start-end-alignment: 0.5rem;
    --newsletter-orange-start-end-x-alignment: 0.75rem;
  }

  .newsletter-signal {
    --orange-creature-diameter: clamp(4.75rem, 8vw, 6.5rem);
    position: absolute;
    top: -1.25rem;
    right: calc(50% - 50vw);
    bottom: 0;
    left: calc(50% - 50vw);
    z-index: 2;
    overflow: visible;
    pointer-events: none;
  }

  .newsletter-orange-route {
    position: absolute;
    top: 0;
    right: max(0px, calc(50% - var(--spacing-container-max) / 2));
    bottom: -3.5rem;
    left: max(0px, calc(50% - var(--spacing-container-max) / 2));
    z-index: 0;
  }

  .newsletter-orange-platform {
    position: absolute;
    z-index: 0;
    display: grid;
    width: 2.94rem;
    height: 1.2rem;
    place-items: center;
    border: 1px solid rgb(255 253 248 / 0.72);
    border-radius: 0.12rem 0.12rem 0.28rem 0.28rem;
    background: rgb(255 253 248 / 0.9);
    box-shadow: 0 0.35rem 0 rgb(255 253 248 / 0.18);
    color: color-mix(in srgb, var(--surface-container-lowest) 88%, black);
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1;
    transform: translateX(-50%);
    transform-origin: 50% 50%;
    will-change: transform;
    animation: newsletter-platform-float 7.2s ease-in-out infinite;
  }

  .newsletter-orange-platform-first {
    top: calc(
      58% +
      var(--orange-creature-diameter) +
      var(--newsletter-orange-y-shift-58) +
      var(--newsletter-orange-text-alignment)
    );
    left: 17%;
  }

  .newsletter-orange-platform-second {
    top: calc(
      43% +
      var(--orange-creature-diameter) +
      var(--newsletter-orange-y-shift-43)
    );
    left: 14%;
    animation-delay: -3.6s;
  }

  .newsletter-creature {
    position: absolute;
    z-index: 1;
    width: clamp(2.7rem, 4.8vw, 3.9rem);
    aspect-ratio: 1;
    border: 1px solid currentColor;
    border-radius: 999px;
    color: var(--secondary);
    opacity: 0.78;
    box-shadow:
      inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
      0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
  }

  .newsletter-creature::before {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0.43rem;
    aspect-ratio: 1;
    content: "";
    border-radius: inherit;
    background: currentColor;
    box-shadow:
      -0.78rem 0 0 -0.13rem currentColor,
      0.78rem 0 0 -0.13rem currentColor,
      0 -0.78rem 0 -0.13rem currentColor,
      0 0.78rem 0 -0.13rem currentColor;
    transform: translate(-50%, -50%);
  }

  .newsletter-creature::after {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0.48rem;
    aspect-ratio: 1;
    content: "";
    border-radius: 999px;
    background: currentColor;
    opacity: 0.62;
  }

  .newsletter-creature-orange {
    top: 2.5%;
    left: 1.4%;
    width: var(--orange-creature-diameter);
    color: var(--tertiary);
    background:
      repeating-radial-gradient(
        circle at center,
        transparent 0 13%,
        color-mix(in srgb, currentColor 24%, transparent) 13.5% 14.5%,
        transparent 15.5% 25%
      ),
      radial-gradient(
        circle at center,
        transparent 0 38%,
        color-mix(in srgb, currentColor 38%, transparent) 38.5% 40.5%,
        transparent 41.5% 100%
      ),
      conic-gradient(
        from 18deg,
        transparent 0 8%,
        color-mix(in srgb, currentColor 20%, transparent) 8% 9%,
        transparent 9% 24%,
        color-mix(in srgb, currentColor 14%, transparent) 24% 25%,
        transparent 25% 41%,
        color-mix(in srgb, currentColor 18%, transparent) 41% 42%,
        transparent 42% 58%,
        color-mix(in srgb, currentColor 12%, transparent) 58% 59%,
        transparent 59% 75%,
        color-mix(in srgb, currentColor 18%, transparent) 75% 76%,
        transparent 76% 100%
      );
    animation:
      newsletter-orange-route-x-v2 var(--newsletter-orange-cycle) linear infinite,
      newsletter-orange-route-y-v2 var(--newsletter-orange-cycle) linear infinite,
      newsletter-orange-route-spin-v2 var(--newsletter-orange-cycle) linear infinite;
  }

  .newsletter-creature-orange::before {
    width: 0.3rem;
    background: color-mix(in srgb, currentColor 82%, transparent);
    box-shadow:
      0 0 0 0.6rem color-mix(in srgb, currentColor 10%, transparent),
      0 0 0 1.35rem color-mix(in srgb, currentColor 6%, transparent);
  }

  .newsletter-creature-collector-a,
  .newsletter-creature-collector-b,
  .newsletter-creature-collector-c {
    top: 0;
    left: 0;
    width: clamp(1.65rem, 2.6vw, 2.2rem);
    opacity: 0.68;
    transition: transform var(--collector-duration) cubic-bezier(0.2, 0.78, 0.24, 1);
    will-change: transform;
  }

  .newsletter-creature-orange::after {
    animation: newsletter-orange-route-refined-momentum var(--newsletter-orange-cycle)
      cubic-bezier(0.55, 0, 0.2, 1) infinite;
  }

  .newsletter-creature-collector-a::after {
    animation: newsletter-collector-a-momentum 6s cubic-bezier(0.55, 0, 0.2, 1) infinite;
  }

  .newsletter-creature-collector-glowing {
    animation: newsletter-collector-consume 420ms ease-out both;
  }

  .newsletter-creature-collector-glowing::before {
    animation: newsletter-collector-shiver 180ms steps(3, end) 2;
  }

  .newsletter-creature-collector-b::after {
    animation: newsletter-collector-b-momentum 7s cubic-bezier(0.55, 0, 0.2, 1) infinite
      -2.5s;
  }

  .newsletter-creature-collector-c::after {
    animation: newsletter-collector-c-momentum 8s cubic-bezier(0.55, 0, 0.2, 1) infinite
      -4s;
  }

  .newsletter-packet {
    position: absolute;
    top: var(--packet-origin-y);
    left: var(--packet-origin-x);
    display: inline-flex;
    align-items: center;
    height: 1.6rem;
    padding: 0 0.55rem;
    border: 1px solid color-mix(in srgb, var(--secondary) 38%, transparent);
    background: color-mix(in srgb, var(--surface-container-lowest) 82%, transparent);
    color: color-mix(in srgb, var(--secondary) 88%, var(--primary));
    font-family: var(--font-body);
    font-size: 0.57rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
    animation: newsletter-packet-toss var(--packet-duration) linear both;
  }

  .newsletter-packet-derezzing {
    top: var(--packet-target-y);
    left: var(--packet-target-x);
    animation: newsletter-packet-derez 420ms ease-in both;
  }

  .newsletter-packet-fragments {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    pointer-events: none;
  }

  .newsletter-packet-fragment {
    min-width: 0;
    min-height: 0;
    background: color-mix(in srgb, var(--secondary) 78%, transparent);
    animation: newsletter-packet-fragment-derez 300ms ease-out var(--fragment-delay)
      both;
  }

  /* Increase contrast and make the signal respond when the newsletter is explored in light mode. */
  :global(html:not(.dark)) .newsletter-creature-orange {
    color: #d65b24;
    opacity: 0.84;
    background: radial-gradient(
      circle at center,
      transparent 0 32%,
      color-mix(in srgb, currentColor 52%, transparent) 33% 35%,
      transparent 36% 57%,
      color-mix(in srgb, currentColor 34%, transparent) 58% 60%,
      transparent 61% 100%
    );
  }

  :global(html:not(.dark)) .newsletter-creature-orange::before {
    background: color-mix(in srgb, currentColor 74%, transparent);
    box-shadow:
      0 0 0 0.46rem color-mix(in srgb, currentColor 9%, transparent),
      0 0 0 1.1rem color-mix(in srgb, currentColor 5%, transparent);
  }

  :global(html:not(.dark)) .newsletter-creature-collector {
    color: #007d67;
    opacity: 0.8;
    transition:
      transform var(--collector-duration) cubic-bezier(0.2, 0.78, 0.24, 1),
      filter 220ms ease,
      opacity 220ms ease;
  }

  :global(html:not(.dark)) .newsletter-orange-platform {
    border-color: rgb(201 79 27 / 0.34);
    background: rgb(255 247 240 / 0.94);
    color: #e3622b;
    font-weight: 900;
    text-shadow: 0 1px 0 rgb(255 253 248 / 0.9);
  }

  :global(html:not(.dark)) .newsletter-creature:not(.newsletter-creature-collector),
  :global(html:not(.dark)) .newsletter-orange-platform {
    transition:
      filter 220ms ease,
      opacity 220ms ease,
      box-shadow 220ms ease,
      translate 220ms ease;
  }

  @media (hover: hover) {
    :global(html:not(.dark)) .newsletter-panel:hover .newsletter-creature-orange {
      filter: drop-shadow(0 0 0.75rem rgb(201 79 27 / 0.3));
      opacity: 1;
    }

    :global(html:not(.dark)) .newsletter-panel:hover .newsletter-creature-collector {
      filter: drop-shadow(0 0 0.55rem rgb(0 125 103 / 0.26));
      opacity: 0.98;
    }

    :global(html:not(.dark)) .newsletter-panel:hover .newsletter-orange-platform {
      box-shadow: 0 0.45rem 0.9rem rgb(201 79 27 / 0.12);
      translate: 0 -0.14rem;
    }
  }

  @keyframes newsletter-platform-float {
    0%,
    100% {
      transform: translateX(-50%) translate3d(0, 0, 0) rotate(0deg);
    }

    25% {
      transform: translateX(-50%) translate3d(1px, -3px, 0) rotate(0.4deg);
    }

    50% {
      transform: translateX(-50%) translate3d(-1px, -6px, 0) rotate(-0.5deg);
    }

    75% {
      transform: translateX(-50%) translate3d(-1px, -3px, 0) rotate(0.25deg);
    }
  }

  @keyframes newsletter-orange-hop {
    0% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
      top: 5%;
      left: 3%;
      transform: rotate(0deg) scale(1);
    }

    3% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: -6%;
      left: 10%;
      transform: rotate(1080deg) scale(1.08, 0.9);
    }

    6%,
    10% {
      top: 5%;
      left: 18%;
      transform: rotate(2160deg) scale(1);
    }

    10% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    13% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: -6%;
      left: 25%;
      transform: rotate(3240deg) scale(1.08, 0.9);
    }

    16%,
    20% {
      top: 5%;
      left: 33%;
      transform: rotate(4320deg) scale(1);
    }

    20% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    23% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: -6%;
      left: 40%;
      transform: rotate(5400deg) scale(1.08, 0.9);
    }

    26%,
    30% {
      top: 5%;
      left: 48%;
      transform: rotate(6480deg) scale(1);
    }

    30% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    33% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: -6%;
      left: 55%;
      transform: rotate(7560deg) scale(1.08, 0.9);
    }

    36%,
    40% {
      top: 5%;
      left: 63%;
      transform: rotate(8640deg) scale(1);
    }

    40% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    43% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: -6%;
      left: 70%;
      transform: rotate(9720deg) scale(1.08, 0.9);
    }

    46%,
    50% {
      top: 5%;
      left: 78%;
      transform: rotate(10800deg) scale(1);
    }

    53% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: 62%;
      left: 80%;
      transform: rotate(12960deg) scale(1);
    }

    56%,
    62% {
      top: 62%;
      left: 66%;
      transform: rotate(12960deg) scale(1);
    }

    62% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    65% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: 55%;
      left: 59%;
      transform: rotate(11880deg) scale(1.08, 0.9);
    }

    68%,
    72% {
      top: 62%;
      left: 52%;
      transform: rotate(10800deg) scale(1);
    }

    72% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    75% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: 55%;
      left: 45%;
      transform: rotate(9720deg) scale(1.08, 0.9);
    }

    78%,
    82% {
      top: 62%;
      left: 38%;
      transform: rotate(8640deg) scale(1);
    }

    82% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    85% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: 55%;
      left: 31%;
      transform: rotate(7560deg) scale(1.08, 0.9);
    }

    88%,
    92% {
      top: 62%;
      left: 24%;
      transform: rotate(6480deg) scale(1);
    }

    92% {
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    95% {
      animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
      top: 55%;
      left: 17%;
      transform: rotate(5400deg) scale(1.08, 0.9);
    }

    98% {
      top: 62%;
      left: 10%;
      transform: rotate(4320deg) scale(1);
    }

    100% {
      top: 5%;
      left: 3%;
      transform: rotate(3240deg) scale(1);
    }
  }

  @keyframes newsletter-collector-a {
    0%,
    15%,
    100% {
      top: 66%;
      left: 13%;
      transform: rotate(0deg) scale(1);
    }

    22%,
    35% {
      top: 53%;
      left: 28%;
      transform: rotate(360deg) scale(1.08, 0.9);
    }

    42%,
    55% {
      top: 74%;
      left: 42%;
      transform: rotate(720deg) scale(1);
    }

    62%,
    75% {
      top: 61%;
      left: 24%;
      transform: rotate(1080deg) scale(1.1, 0.88);
    }
  }

  @keyframes newsletter-collector-b {
    0%,
    13%,
    100% {
      top: 26%;
      left: 35%;
      transform: rotate(0deg) scale(1);
    }

    20%,
    32% {
      top: 47%;
      left: 49%;
      transform: rotate(360deg) scale(1.08, 0.9);
    }

    39%,
    51% {
      top: 31%;
      left: 64%;
      transform: rotate(720deg) scale(1);
    }

    58%,
    70% {
      top: 59%;
      left: 53%;
      transform: rotate(1080deg) scale(1.1, 0.88);
    }

    77%,
    89% {
      top: 38%;
      left: 40%;
      transform: rotate(1440deg) scale(1);
    }
  }

  @keyframes newsletter-collector-c {
    0%,
    15%,
    100% {
      top: 79%;
      left: 59%;
      transform: rotate(0deg) scale(1);
    }

    22%,
    34% {
      top: 63%;
      left: 72%;
      transform: rotate(360deg) scale(1.08, 0.9);
    }

    41%,
    53% {
      top: 85%;
      left: 81%;
      transform: rotate(720deg) scale(1);
    }

    60%,
    72% {
      top: 57%;
      left: 66%;
      transform: rotate(1080deg) scale(1.1, 0.88);
    }
  }

  @keyframes newsletter-orange-momentum {
    0%,
    5% {
      transform: translate(-2.25rem, 0.15rem) scale(0.82);
    }

    10%,
    13%,
    18%,
    21%,
    26%,
    29%,
    34%,
    37%,
    42%,
    45% {
      transform: translate(-2.25rem, 0.15rem) scale(1.12);
    }

    51%,
    55% {
      transform: translate(-2rem, -2.2rem) scale(0.82);
    }

    60%,
    63%,
    68%,
    71%,
    76%,
    79%,
    84%,
    87%,
    92%,
    95% {
      transform: translate(2.25rem, 0.15rem) scale(1.12);
    }

    100% {
      transform: translate(2rem, 2.2rem) scale(0.82);
    }
  }

  @keyframes newsletter-orange-route {
    0%,
    4% {
      top: 5%;
      left: 3%;
      transform: rotate(0deg) scale(1);
    }

    8% {
      top: -6%;
      left: 12%;
      transform: rotate(1080deg) scale(1.08, 0.9);
    }

    12%,
    14% {
      top: 5%;
      left: 21%;
      transform: rotate(2160deg) scale(1);
    }

    16% {
      top: -6%;
      left: 30%;
      transform: rotate(3240deg) scale(1.08, 0.9);
    }

    20%,
    22% {
      top: 5%;
      left: 39%;
      transform: rotate(4320deg) scale(1);
    }

    24% {
      top: -6%;
      left: 48%;
      transform: rotate(5400deg) scale(1.08, 0.9);
    }

    28%,
    30% {
      top: 5%;
      left: 57%;
      transform: rotate(6480deg) scale(1);
    }

    32% {
      top: -6%;
      left: 66%;
      transform: rotate(7560deg) scale(1.08, 0.9);
    }

    36%,
    38% {
      top: 5%;
      left: 75%;
      transform: rotate(8640deg) scale(1);
    }

    41% {
      top: 25%;
      left: 84%;
      transform: rotate(9000deg) scale(1.05, 0.96);
    }

    44% {
      top: 62%;
      left: 80%;
      transform: rotate(9360deg) scale(1);
    }

    50% {
      top: 62%;
      left: 80%;
      transform: rotate(9540deg) scale(1);
    }

    54% {
      top: 50%;
      left: 70%;
      transform: rotate(8100deg) scale(1.08, 0.9);
    }

    58%,
    60% {
      top: 62%;
      left: 60%;
      transform: rotate(7020deg) scale(1);
    }

    62% {
      top: 50%;
      left: 50%;
      transform: rotate(5940deg) scale(1.08, 0.9);
    }

    66%,
    68% {
      top: 62%;
      left: 40%;
      transform: rotate(4860deg) scale(1);
    }

    70% {
      top: 50%;
      left: 30%;
      transform: rotate(3780deg) scale(1.08, 0.9);
    }

    74%,
    76% {
      top: 62%;
      left: 20%;
      transform: rotate(2700deg) scale(1);
    }

    78% {
      top: 50%;
      left: 10%;
      transform: rotate(1620deg) scale(1.08, 0.9);
    }

    82%,
    84% {
      top: 62%;
      left: 0%;
      transform: rotate(540deg) scale(1);
    }

    90% {
      top: 62%;
      left: 0%;
      transform: rotate(360deg) scale(1);
    }

    97% {
      top: 24%;
      left: -4%;
      transform: rotate(-720deg) scale(1.08, 0.9);
    }

    100% {
      top: 5%;
      left: 3%;
      transform: rotate(-3600deg) scale(1);
    }
  }

  @keyframes newsletter-orange-route-momentum {
    0%,
    38% {
      transform: translate(-2.25rem, 0.2rem) scale(0.82);
    }

    41% {
      transform: translate(-1.8rem, -2.2rem) scale(1.12);
    }

    44%,
    50% {
      transform: translate(-2rem, -2.25rem) scale(0.82);
    }

    54%,
    78% {
      transform: translate(2.25rem, 0.2rem) scale(1.12);
    }

    82%,
    90% {
      transform: translate(2.2rem, 1.8rem) scale(0.82);
    }

    97% {
      transform: translate(-1.8rem, 2.2rem) scale(1.12);
    }

    100% {
      transform: translate(2.1rem, 1.9rem) scale(0.82);
    }
  }

  @keyframes newsletter-orange-route-refined {
    0% {
      top: 20%;
      left: 3%;
      transform: rotate(0deg) scale(1);
    }

    6% {
      top: 5%;
      left: 12%;
      transform: rotate(1080deg) scale(1.08, 0.9);
    }

    12% {
      top: 20%;
      left: 21%;
      transform: rotate(2160deg) scale(1);
    }

    18% {
      top: 5%;
      left: 30%;
      transform: rotate(3240deg) scale(1.08, 0.9);
    }

    24% {
      top: 20%;
      left: 39%;
      transform: rotate(4320deg) scale(1);
    }

    30% {
      top: 5%;
      left: 48%;
      transform: rotate(5400deg) scale(1.08, 0.9);
    }

    36% {
      top: 20%;
      left: 57%;
      transform: rotate(6480deg) scale(1);
    }

    42% {
      top: 5%;
      left: 66%;
      transform: rotate(7560deg) scale(1.08, 0.9);
    }

    48% {
      top: 20%;
      left: 75%;
      transform: rotate(8640deg) scale(1);
    }

    54% {
      top: 42%;
      left: 84%;
      transform: rotate(9000deg) scale(1.05, 0.96);
    }

    58% {
      top: 62%;
      left: 80%;
      transform: rotate(9360deg) scale(1);
    }

    61% {
      top: 62%;
      left: 80%;
      transform: rotate(9540deg) scale(1);
    }

    64% {
      top: 49%;
      left: 70%;
      transform: rotate(8100deg) scale(1.08, 0.9);
    }

    68% {
      top: 62%;
      left: 60%;
      transform: rotate(7020deg) scale(1);
    }

    72% {
      top: 49%;
      left: 50%;
      transform: rotate(5940deg) scale(1.08, 0.9);
    }

    76% {
      top: 62%;
      left: 40%;
      transform: rotate(4860deg) scale(1);
    }

    80% {
      top: 49%;
      left: 30%;
      transform: rotate(3780deg) scale(1.08, 0.9);
    }

    84% {
      top: 62%;
      left: 20%;
      transform: rotate(2700deg) scale(1);
    }

    88% {
      top: 49%;
      left: 10%;
      transform: rotate(1620deg) scale(1.08, 0.9);
    }

    92% {
      top: 62%;
      left: 0%;
      transform: rotate(540deg) scale(1);
    }

    94% {
      top: 62%;
      left: 0%;
      transform: rotate(360deg) scale(1);
    }

    97% {
      top: 31%;
      left: -3%;
      transform: rotate(-720deg) scale(1.08, 0.9);
    }

    100% {
      top: 20%;
      left: 3%;
      transform: rotate(-3600deg) scale(1);
    }
  }

  @keyframes newsletter-orange-route-refined-momentum {
    0%,
    48% {
      transform: translate(-2.25rem, 0.2rem) scale(0.82);
    }

    54% {
      transform: translate(-1.8rem, -2.2rem) scale(1.12);
    }

    58%,
    61% {
      transform: translate(-2rem, -2.25rem) scale(0.82);
    }

    64%,
    88% {
      transform: translate(2.25rem, 0.2rem) scale(1.12);
    }

    92%,
    94% {
      transform: translate(2.2rem, 1.8rem) scale(0.82);
    }

    97% {
      transform: translate(-1.8rem, 2.2rem) scale(1.12);
    }

    100% {
      transform: translate(2.1rem, 1.9rem) scale(0.82);
    }
  }

  @keyframes newsletter-orange-route-x {
    0% {
      left: 3%;
    }

    48% {
      left: 75%;
    }

    54% {
      left: 84%;
    }

    58%,
    61% {
      left: 80%;
    }

    92%,
    94% {
      left: 0%;
    }

    97% {
      left: -3%;
    }

    100% {
      left: 3%;
    }
  }

  @keyframes newsletter-orange-route-y {
    0% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: -10%;
    }

    6% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: -26%;
    }

    12% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: -10%;
    }

    18% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: -26%;
    }

    24% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: -10%;
    }

    30% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: -26%;
    }

    36% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: -10%;
    }

    42% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: -26%;
    }

    48% {
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
      top: -10%;
    }

    58%,
    61% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: 62%;
    }

    64% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 46%;
    }

    68% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: 62%;
    }

    72% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 46%;
    }

    76% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: 62%;
    }

    80% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 46%;
    }

    84% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: 62%;
    }

    88% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 46%;
    }

    92%,
    94% {
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
      top: 62%;
    }

    97% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 14%;
    }

    100% {
      top: -10%;
    }
  }

  @keyframes newsletter-orange-route-spin {
    0% {
      transform: rotate(0deg);
    }

    48% {
      transform: rotate(8640deg);
    }

    58% {
      transform: rotate(9360deg);
    }

    61% {
      transform: rotate(9540deg);
    }

    92% {
      transform: rotate(540deg);
    }

    94% {
      transform: rotate(360deg);
    }

    100% {
      transform: rotate(-3600deg);
    }
  }

  @keyframes newsletter-collector-a-momentum {
    0%,
    15%,
    100% {
      transform: translate(-1rem, 0.9rem) scale(0.82);
    }

    22%,
    35% {
      transform: translate(-1rem, 0.9rem) scale(1.15);
    }

    42%,
    55% {
      transform: translate(-1rem, -0.9rem) scale(0.82);
    }

    62%,
    75% {
      transform: translate(1rem, 0.9rem) scale(1.15);
    }
  }

  @keyframes newsletter-collector-b-momentum {
    0%,
    13%,
    100% {
      transform: translate(-1rem, -0.9rem) scale(0.82);
    }

    20%,
    32% {
      transform: translate(-1rem, -0.9rem) scale(1.15);
    }

    39%,
    51% {
      transform: translate(-1rem, 0.9rem) scale(0.82);
    }

    58%,
    70% {
      transform: translate(1rem, -0.9rem) scale(1.15);
    }

    77%,
    89% {
      transform: translate(1rem, 0.9rem) scale(0.82);
    }
  }

  @keyframes newsletter-collector-c-momentum {
    0%,
    15%,
    100% {
      transform: translate(-1rem, 0.9rem) scale(0.82);
    }

    22%,
    34% {
      transform: translate(-1rem, 0.9rem) scale(1.15);
    }

    41%,
    53% {
      transform: translate(-1rem, -0.9rem) scale(0.82);
    }

    60%,
    72% {
      transform: translate(1rem, 0.9rem) scale(1.15);
    }
  }

  @keyframes newsletter-packet-toss {
    0% {
      top: var(--packet-origin-y);
      left: var(--packet-origin-x);
      transform: translate(0, 0) rotate(0deg) scale(0.72, 0.9);
      opacity: 0;
    }

    10% {
      opacity: 0.9;
    }

    12.5% {
      top: var(--packet-eighth-y);
      left: var(--packet-eighth-x);
      transform: rotate(calc(var(--packet-rotation) * 0.125)) scale(0.93, 0.97);
      opacity: 0.9;
    }

    25% {
      top: var(--packet-quarter-y);
      left: var(--packet-quarter-x);
      transform: rotate(calc(var(--packet-rotation) * 0.25)) scale(1);
      opacity: 0.9;
    }

    37.5% {
      top: var(--packet-three-eighth-y);
      left: var(--packet-three-eighth-x);
      transform: rotate(calc(var(--packet-rotation) * 0.375)) scale(1);
      opacity: 0.9;
    }

    50% {
      top: var(--packet-midpoint-y);
      left: var(--packet-midpoint-x);
      transform: rotate(calc(var(--packet-rotation) * 0.5)) scale(1);
      opacity: 0.9;
    }

    62.5% {
      top: var(--packet-five-eighth-y);
      left: var(--packet-five-eighth-x);
      transform: rotate(calc(var(--packet-rotation) * 0.625)) scale(1);
      opacity: 0.9;
    }

    75% {
      top: var(--packet-three-quarter-y);
      left: var(--packet-three-quarter-x);
      transform: rotate(calc(var(--packet-rotation) * 0.75)) scale(1);
      opacity: 0.9;
    }

    87.5% {
      top: var(--packet-seven-eighth-y);
      left: var(--packet-seven-eighth-x);
      transform: rotate(calc(var(--packet-rotation) * 0.875)) scale(1);
      opacity: 0.9;
    }

    100% {
      top: var(--packet-target-y);
      left: var(--packet-target-x);
      transform: translate(0, 0) rotate(var(--packet-rotation)) scale(1);
      opacity: 0.9;
    }
  }

  @keyframes newsletter-packet-derez {
    0% {
      filter: brightness(1);
      border-color: color-mix(in srgb, var(--secondary) 38%, transparent);
      background: color-mix(in srgb, var(--surface-container-lowest) 82%, transparent);
      color: color-mix(in srgb, var(--secondary) 88%, var(--primary));
    }

    45% {
      filter: brightness(1.8) saturate(0.35);
      border-color: transparent;
      background: transparent;
      color: transparent;
    }

    100% {
      filter: brightness(2.4) saturate(0);
      border-color: transparent;
      background: transparent;
      color: transparent;
    }
  }

  @keyframes newsletter-packet-fragment-derez {
    0% {
      opacity: 0.9;
      transform: translate(0, 0) scale(1);
    }

    100% {
      opacity: 0;
      transform: translate(
          calc(var(--fragment-x) * 1rem),
          calc(var(--fragment-y) * 1rem)
        )
        scale(0.08);
    }
  }

  @keyframes newsletter-collector-consume {
    0% {
      filter: brightness(1);
      box-shadow:
        inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
        0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
    }

    45% {
      filter: brightness(1.7) saturate(1.35);
      box-shadow:
        inset 0 0 0 0.42rem color-mix(in srgb, currentColor 16%, transparent),
        0 0 0 0.8rem color-mix(in srgb, currentColor 16%, transparent),
        0 0 1.3rem color-mix(in srgb, currentColor 62%, transparent);
    }

    100% {
      filter: brightness(1);
      box-shadow:
        inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
        0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
    }
  }

  @keyframes newsletter-collector-shiver {
    0%,
    100% {
      transform: translate(-50%, -50%);
    }

    33% {
      transform: translate(calc(-50% - 1px), calc(-50% + 1px));
    }

    66% {
      transform: translate(calc(-50% + 1px), calc(-50% - 1px));
    }
  }

  @keyframes newsletter-orange-route-x-v2 {
    0%,
    2% {
      left: calc(1% + var(--newsletter-orange-start-end-x-alignment));
    }
    4% {
      left: 10%;
    }
    8%,
    10% {
      left: 18%;
    }
    14% {
      left: 25%;
    }
    18%,
    20% {
      left: 33%;
    }
    24% {
      left: 38%;
    }
    28%,
    30% {
      left: 45%;
    }
    34% {
      left: 52%;
    }
    38%,
    40% {
      left: 60%;
    }
    44% {
      left: 67%;
    }
    48%,
    50% {
      left: 75%;
    }
    52% {
      left: 82%;
    }
    56% {
      left: 89%;
    }
    58% {
      left: 93%;
    }
    60% {
      left: 97%;
    }
    62% {
      left: 99%;
    }
    64% {
      left: 100%;
    }
    66.1% {
      left: 97%;
    }
    68.2% {
      left: 90%;
    }
    70.3% {
      left: 83%;
    }
    72.4% {
      left: 76%;
    }
    74.5% {
      left: 69%;
    }
    76.6% {
      left: 62%;
    }
    78.7% {
      left: 55%;
    }
    80.8% {
      left: 48%;
    }
    82.9% {
      left: 41%;
    }
    85% {
      left: 34%;
    }
    87.5% {
      left: 27%;
    }
    90% {
      left: 20%;
    }
    92% {
      left: 13%;
    }
    94% {
      left: 9.5%;
    }
    96% {
      left: 6%;
    }
    97.5% {
      left: 3.5%;
    }
    100% {
      left: calc(1% + var(--newsletter-orange-start-end-x-alignment));
    }
  }

  @keyframes newsletter-orange-route-y-v2 {
    0%,
    2% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        15% +
        var(--newsletter-orange-y-shift-15) +
        var(--newsletter-orange-start-end-alignment)
      );
    }
    4% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    8%,
    10% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        15% +
        var(--newsletter-orange-y-shift-15) +
        var(--newsletter-orange-initial-hop-alignment)
      );
    }
    14% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    18%,
    20% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        14.6% +
        var(--newsletter-orange-y-shift-14-6) +
        var(--newsletter-orange-initial-hop-alignment)
      );
    }
    24% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    28%,
    30% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        14.5% +
        var(--newsletter-orange-y-shift-14-5) +
        var(--newsletter-orange-initial-hop-alignment)
      );
    }
    34% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    38%,
    40% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(15% + var(--newsletter-orange-y-shift-15));
    }
    44% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    48%,
    50% {
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
      top: calc(15% + var(--newsletter-orange-y-shift-15));
    }
    52% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    56% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(15% + var(--newsletter-orange-y-shift-15));
    }
    58% {
      animation-timing-function: cubic-bezier(0.42, 0, 1, 1);
      top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
    }
    64% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    66.1% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        58% +
        var(--newsletter-orange-y-shift-58) +
        var(--newsletter-orange-text-alignment)
      );
    }
    68.2% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    70.3% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        45% +
        var(--newsletter-orange-y-shift-45) +
        var(--newsletter-orange-text-alignment)
      );
    }
    72.4% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    74.5% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        45% +
        var(--newsletter-orange-y-shift-45) +
        var(--newsletter-orange-text-alignment)
      );
    }
    76.6% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    78.7% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        45% +
        var(--newsletter-orange-y-shift-45) +
        var(--newsletter-orange-text-alignment)
      );
    }
    80.8% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    82.9% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        45% +
        var(--newsletter-orange-y-shift-45) +
        var(--newsletter-orange-text-alignment)
      );
    }
    85% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    87.5% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: calc(
        45% +
        var(--newsletter-orange-y-shift-45) +
        var(--newsletter-orange-text-alignment)
      );
    }
    90% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        67% +
        var(--newsletter-orange-y-shift-67) +
        var(--newsletter-orange-floor-alignment)
      );
    }
    92% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(
        58% +
        var(--newsletter-orange-y-shift-58) +
        var(--newsletter-orange-text-alignment)
      );
    }
    94% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(43% + var(--newsletter-orange-y-shift-43));
    }
    96% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: calc(30% + var(--newsletter-orange-y-shift-30));
    }
    97.5% {
      animation-timing-function: cubic-bezier(0.42, 0, 1, 1);
      top: calc(11% + var(--newsletter-orange-y-shift-11));
    }
    100% {
      top: calc(
        15% +
        var(--newsletter-orange-y-shift-15) +
        var(--newsletter-orange-start-end-alignment)
      );
    }
  }

  @keyframes newsletter-orange-route-spin-v2 {
    0%,
    2% {
      transform: rotate(0deg);
    }
    4% {
      transform: rotate(720deg);
    }
    8% {
      animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
      transform: rotate(1440deg);
    }
    9% {
      transform: rotate(1530deg);
    }
    10% {
      transform: rotate(1560deg);
    }
    14% {
      transform: rotate(2280deg);
    }
    18% {
      animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
      transform: rotate(3000deg);
    }
    19% {
      transform: rotate(3090deg);
    }
    20% {
      transform: rotate(3120deg);
    }
    24% {
      transform: rotate(3840deg);
    }
    28% {
      animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
      transform: rotate(4560deg);
    }
    29% {
      transform: rotate(4650deg);
    }
    30% {
      transform: rotate(4680deg);
    }
    34% {
      transform: rotate(5400deg);
    }
    38% {
      animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
      transform: rotate(6120deg);
    }
    39% {
      transform: rotate(6210deg);
    }
    40% {
      transform: rotate(6240deg);
    }
    44% {
      transform: rotate(6960deg);
    }
    48% {
      animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
      transform: rotate(7680deg);
    }
    49% {
      transform: rotate(7770deg);
    }
    50% {
      transform: rotate(7800deg);
    }
    52% {
      transform: rotate(8520deg);
    }
    56% {
      transform: rotate(9960deg);
    }
    58% {
      transform: rotate(10680deg);
    }
    64% {
      transform: rotate(12840deg);
    }
    66.1% {
      transform: rotate(12120deg);
    }
    68.2% {
      transform: rotate(11400deg);
    }
    70.3% {
      transform: rotate(10680deg);
    }
    72.4% {
      transform: rotate(9960deg);
    }
    74.5% {
      transform: rotate(9240deg);
    }
    76.6% {
      transform: rotate(8520deg);
    }
    78.7% {
      transform: rotate(7800deg);
    }
    80.8% {
      transform: rotate(7080deg);
    }
    82.9% {
      transform: rotate(6360deg);
    }
    85% {
      transform: rotate(5640deg);
    }
    87.5% {
      transform: rotate(4920deg);
    }
    90% {
      transform: rotate(4200deg);
    }
    92% {
      transform: rotate(3840deg);
    }
    94% {
      transform: rotate(3360deg);
    }
    96% {
      transform: rotate(2820deg);
    }
    97.5% {
      transform: rotate(2280deg);
    }
    100% {
      transform: rotate(1800deg);
    }
  }

  @media (min-width: 768px) {
    .newsletter-panel {
      --newsletter-orange-y-shift-15: clamp(1.232rem, 2.464vw, 2.156rem);
      --newsletter-orange-y-shift-negative-3: clamp(1.866rem, 3.731vw, 3.265rem);
      --newsletter-orange-y-shift-14-6: clamp(1.247rem, 2.494vw, 2.182rem);
      --newsletter-orange-y-shift-14-5: clamp(1.25rem, 2.499vw, 2.187rem);
      --newsletter-orange-y-shift-67: clamp(-1.047rem, -1.183vw, -0.598rem);
      --newsletter-orange-y-shift-58: clamp(-0.493rem, -0.557vw, -0.282rem);
      --newsletter-orange-y-shift-45: clamp(0.176rem, 0.352vw, 0.308rem);
      --newsletter-orange-y-shift-43: clamp(0.246rem, 0.493vw, 0.431rem);
      --newsletter-orange-y-shift-30: clamp(0.704rem, 1.408vw, 1.232rem);
      --newsletter-orange-y-shift-11: clamp(1.373rem, 2.746vw, 2.402rem);
    }
  }

  @media (max-width: 900px) {
    .newsletter-creature,
    .newsletter-orange-platform {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .newsletter-creature,
    .newsletter-creature::after,
    .newsletter-packet,
    .newsletter-orange-platform {
      animation: none;
    }

    .newsletter-creature {
      opacity: 0.55;
    }

    .newsletter-packet {
      opacity: 0.52;
    }
  }
}
</style>
