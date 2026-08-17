<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section
  class={cn(
    'landing-community-section flex min-h-[calc(100svh-var(--landing-header-height,4.5rem))] flex-col min-[901px]:min-h-0 min-[901px]:overflow-hidden',
    className,
  )}
>
  {@render children?.()}
</section>

<style>
@media (min-width: 901px) {
  .landing-community-section {
    position: relative;
    isolation: isolate;
    /* 41rem is the FHD composition. On shorter or narrower displays, every
     * desktop element keys off this single dimension rather than independently
     * responding to the viewport. */
    --community-shape-size: min(41rem, 42vw, 60.75svh);
    --community-discussions-size: var(--community-shape-size);
    --community-discord-offset: 24px;
    height: max(100svh, 42.75rem, calc(var(--community-shape-size) + 12rem));
  }

  :global(.community-spaces) {
    position: relative;
    z-index: 2;
    flex: 1 1 0;
  }

  :global(.community-spaces-grid) {
    display: grid;
    height: var(--community-shape-size);
    grid-template-columns: repeat(2, var(--community-shape-size));
    justify-content: center;
    gap: 0;
    --community-blob-clip-path: shape(
      from 94.43% 43.59%,
      curve to 92.63% 55.93% with 90.99% 50.00%,
      smooth to 92.79% 67.86%,
      smooth to 83.99% 75.26%,
      smooth to 73.76% 81.39%,
      smooth to 66.33% 90.08%,
      smooth to 55.90% 96.66%,
      smooth to 45.14% 92.77%,
      smooth to 32.76% 89.57%,
      smooth to 22.15% 86.91%,
      smooth to 18.92% 74.48%,
      smooth to 15.67% 64.03%,
      smooth to 11.04% 55.01%,
      smooth to 8.36% 44.27%,
      smooth to 9.39% 33.17%,
      smooth to 16.91% 25.03%,
      smooth to 25.51% 17.73%,
      smooth to 33.17% 8.43%,
      smooth to 43.79% 4.12%,
      smooth to 55.24% 7.72%,
      smooth to 64.66% 14.13%,
      smooth to 71.91% 21.19%,
      smooth to 81.80% 26.36%,
      smooth to 93.24% 32.44%,
      smooth to 94.43% 43.59%
    );
  }

  :global(.community-space-card) {
    position: relative;
    aspect-ratio: 1;
    transform-origin: 50% 50%;
    transition: filter 260ms ease;
  }

  :global(.community-space-card-discord) {
    z-index: 2;
    left: -4rem;
    top: calc(2rem + var(--community-discord-offset) - 32px);
    height: calc(var(--community-shape-size) + 48px);
    transform: translateY(calc(var(--community-shape-size) * 0.02)) rotate(0deg)
      translate(
        calc(var(--community-shape-size) * -0.036585),
        calc(var(--community-shape-size) * -0.082927)
      );
    clip-path: shape(
      from 94.43% 43.59%,
      curve to 92.63% 55.93% with 90.99% 50.00%,
      smooth to 92.79% 67.86%,
      smooth to 83.99% 75.26%,
      smooth to 73.76% 81.39%,
      smooth to 66.33% 90.08%,
      smooth to 55.90% 96.66%,
      smooth to 45.14% 92.77%,
      smooth to 32.76% 89.57%,
      smooth to 22.15% 86.91%,
      smooth to 18.92% 74.48%,
      smooth to 15.67% 64.03%,
      smooth to 11.04% 55.01%,
      smooth to 8.36% 44.27%,
      smooth to 9.39% 33.17%,
      smooth to 16.91% 25.03%,
      smooth to 25.51% 17.73%,
      smooth to 33.17% 8.43%,
      smooth to 43.79% 4.12%,
      smooth to 55.24% 7.72%,
      smooth to 64.66% 14.13%,
      smooth to 71.91% 21.19%,
      smooth to 81.80% 26.36%,
      smooth to 93.24% 32.44%,
      smooth to 94.43% 43.59%
    );
  }

  :global(.community-space-card-discussions) {
    z-index: 3;
    left: 4rem;
    margin-left: calc(var(--community-shape-size) * -0.109756);
    transform: translateY(calc(var(--community-shape-size) * 0.02))
      translate(
        calc(var(--community-shape-size) * 0.085366),
        calc(var(--community-shape-size) * -0.253049)
      )
      scaleX(-1);
    clip-path: shape(
      from 94.43% 43.59%,
      curve to 92.63% 55.93% with 90.99% 50.00%,
      smooth to 92.79% 67.86%,
      smooth to 83.99% 75.26%,
      smooth to 73.76% 81.39%,
      smooth to 66.33% 90.08%,
      smooth to 55.90% 96.66%,
      smooth to 45.14% 92.77%,
      smooth to 32.76% 89.57%,
      smooth to 22.15% 86.91%,
      smooth to 18.92% 74.48%,
      smooth to 15.67% 64.03%,
      smooth to 11.04% 55.01%,
      smooth to 8.36% 44.27%,
      smooth to 9.39% 33.17%,
      smooth to 16.91% 25.03%,
      smooth to 25.51% 17.73%,
      smooth to 33.17% 8.43%,
      smooth to 43.79% 4.12%,
      smooth to 55.24% 7.72%,
      smooth to 64.66% 14.13%,
      smooth to 71.91% 21.19%,
      smooth to 81.80% 26.36%,
      smooth to 93.24% 32.44%,
      smooth to 94.43% 43.59%
    );
  }

  :global(.community-space-card-discord:hover) {
    filter: drop-shadow(0 0 1.25rem rgb(88 101 242 / 0.52));
  }

  :global(.community-space-card-discussions:hover) {
    filter: drop-shadow(0 0 1.25rem rgb(15 157 133 / 0.52));
  }
}

/* Match the pipeline's 16:9 scale once the viewport exceeds FHD. The FHD
 * artwork stays at 41rem, while larger viewports grow in both axes rather
 * than creating unused space around a fixed composition. */
@media (min-width: 120rem) {
  .landing-community-section {
    --community-shape-size: min(34.166667vw, 60.740741svh);
  }
}

@media (max-width: 1050px) and (min-width: 901px) {
  :global(.community-space-card-discussions) {
    margin-left: -3rem;
  }
}

:global {
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature::after,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-packet,
  .newsletter-panel:not(.newsletter-panel-active) .newsletter-packet-fragment {
    animation-play-state: paused;
  }

  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature-orange {
    animation: none;
    visibility: hidden;
  }

  .newsletter-panel:not(.newsletter-panel-active) .newsletter-creature-orange::before {
    animation: none;
  }

  .newsletter-panel-active .newsletter-creature-orange {
    visibility: visible;
  }

  .newsletter-panel-animation-disabled .newsletter-creature,
  .newsletter-panel-animation-disabled .newsletter-packet,
  .newsletter-panel-animation-disabled .newsletter-packet-fragment {
    display: none;
  }

  .newsletter-panel {
    /* GOD's route is paired with live packet launches on each jump. */
    --newsletter-orange-intro-duration: 14s;
    /* Upper-platform hops are deliberately 30% slower, while the spin
     * keyframes still complete one full turn for each hop. */
    --newsletter-orange-title-duration: 15.6s;
    --newsletter-orange-freefall-trigger-duration: 5.9s;
    --newsletter-orange-freefall-duration: 3.8s;
    --newsletter-orange-lower-landing-duration: 900ms;
    --newsletter-orange-return-duration: 12.5s;
    --newsletter-orange-loop-duration: 12.5s;
    --newsletter-orange-loop-freefall-trigger-duration: 12.25s;
    --newsletter-orange-y-shift-58: clamp(-0.422rem, -0.493vw, -0.229rem);
    --newsletter-orange-y-shift-43: clamp(0.2rem, 0.431vw, 0.37rem);
    --newsletter-orange-text-alignment: 1.25rem;
  }

  .newsletter-signal {
    --orange-creature-diameter: clamp(4.75rem, 8vw, 6.5rem);
    position: absolute;
    top: -1.25rem;
    right: calc(50% - 50vw);
    bottom: 0;
    left: calc(50% - 50vw);
    z-index: 0;
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
    color: var(--newsletter-highlight);
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
      newsletter-orange-intro var(--newsletter-orange-intro-duration) linear both,
      newsletter-orange-intro-spin var(--newsletter-orange-intro-duration) linear both,
      newsletter-orange-title-route var(--newsletter-orange-title-duration) linear
      var(--newsletter-orange-intro-duration) forwards,
      newsletter-orange-title-spin var(--newsletter-orange-title-duration) linear
      var(--newsletter-orange-intro-duration) forwards,
      newsletter-orange-freefall-trigger
      var(--newsletter-orange-freefall-trigger-duration) linear
      var(--newsletter-orange-intro-duration) both;
  }

  .newsletter-creature-orange::before {
    display: none;
  }

  .newsletter-orange-bearing {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 1;
    width: 0.42rem;
    aspect-ratio: 1;
    border-radius: 999px;
    background: currentColor;
    box-shadow: 0 0 0 0.14rem color-mix(in srgb, currentColor 13%, transparent);
    /* The outermost repeating radial line is centred at 88.5% of GOD's
     * radius, which is 44.25% of its diameter. */
    --newsletter-orange-bearing-radius: calc(var(--orange-creature-diameter) * -0.4425);
    transform: translate(-50%, -50%) translateY(var(--newsletter-orange-bearing-radius));
    transform-origin: 50% 50%;
    will-change: transform;
  }

  .newsletter-creature-collector-a,
  .newsletter-creature-collector-b,
  .newsletter-creature-collector-c {
    top: 0;
    left: 0;
    width: clamp(1.65rem, 2.6vw, 2.2rem);
    border-width: 1.5px;
    opacity: 0.82;
    background: transparent;
    transition: transform var(--collector-duration) cubic-bezier(0.2, 0.78, 0.24, 1);
    will-change: transform;
  }

  .newsletter-collector-bearing {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    width: 0.34rem;
    aspect-ratio: 1;
    border-radius: 999px;
    background: currentColor;
    box-shadow: 0 0 0 0.1rem color-mix(in srgb, currentColor 16%, transparent);
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    will-change: transform;
  }

  .newsletter-creature-orange::after {
    display: none;
  }

  .newsletter-creature-collector::after {
    display: none;
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
    background: transparent;
    box-shadow:
      calc(var(--orange-creature-diameter) * -0.34) 0 0 -0.04rem currentColor,
      calc(var(--orange-creature-diameter) * 0.34) 0 0 -0.04rem currentColor,
      0 calc(var(--orange-creature-diameter) * -0.34) 0 -0.04rem currentColor,
      0 calc(var(--orange-creature-diameter) * 0.34) 0 -0.04rem currentColor;
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

  @keyframes newsletter-orange-intro {
    0%,
    9.43% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-start-x);
      transform: scale(0.9, 0.96);
      animation-timing-function: step-end;
    }

    11% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-edge-x);
      transform: scale(0.9, 0.96);
      animation-timing-function: step-end;
    }

    12.57% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-edge-x);
      transform: scale(0.9, 0.96);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    18.86% {
      top: var(--newsletter-orange-intro-apex-y);
      left: var(--newsletter-orange-intro-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    28.29% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-first-ground-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    34.57% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-first-ground-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    42.43% {
      top: var(--newsletter-orange-setup-apex-y);
      left: var(--newsletter-orange-setup-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    51.86% {
      top: var(--newsletter-orange-setup-y);
      left: var(--newsletter-orange-setup-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    55% {
      top: var(--newsletter-orange-setup-y);
      left: var(--newsletter-orange-setup-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    61.29% {
      top: var(--newsletter-orange-step-one-apex-y);
      left: var(--newsletter-orange-step-one-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    67.57% {
      top: var(--newsletter-orange-step-one-y);
      left: var(--newsletter-orange-step-one-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    69.14% {
      top: var(--newsletter-orange-step-one-y);
      left: var(--newsletter-orange-step-one-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    73.86% {
      top: var(--newsletter-orange-step-two-apex-y);
      left: var(--newsletter-orange-step-two-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    78.57% {
      top: var(--newsletter-orange-step-two-y);
      left: var(--newsletter-orange-step-two-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    82.5% {
      top: var(--newsletter-orange-step-two-y);
      left: var(--newsletter-orange-step-two-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    89.25% {
      top: var(--newsletter-orange-letter-apex-y);
      left: var(--newsletter-orange-letter-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    96%,
    100% {
      top: var(--newsletter-orange-letter-y);
      left: var(--newsletter-orange-letter-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }
  }

  @keyframes newsletter-orange-intro-spin {
    0%,
    9.43%,
    11%,
    12.57% {
      rotate: 0deg;
    }

    18.86% {
      rotate: 540deg;
    }

    28.29%,
    34.57% {
      rotate: 1080deg;
    }

    42.43% {
      rotate: 1620deg;
    }

    51.86%,
    55% {
      rotate: 2160deg;
    }

    61.29% {
      rotate: 2700deg;
    }

    67.57%,
    69.14% {
      rotate: 3240deg;
    }

    73.86% {
      rotate: 3060deg;
    }

    78.57% {
      rotate: 2880deg;
    }

    82.5% {
      rotate: 2880deg;
    }

    89.25% {
      rotate: 3240deg;
    }

    96%,
    100% {
      rotate: 3960deg;
    }
  }

  @keyframes newsletter-orange-title-route {
    0% {
      top: var(--newsletter-orange-letter-y);
      left: var(--newsletter-orange-letter-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    2% {
      top: var(--newsletter-orange-letter-y);
      left: var(--newsletter-orange-letter-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    6% {
      top: var(--newsletter-orange-title-hop-one-apex-y);
      left: var(--newsletter-orange-title-hop-one-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    10% {
      top: var(--newsletter-orange-title-hop-one-y);
      left: var(--newsletter-orange-title-hop-one-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    14% {
      top: var(--newsletter-orange-title-hop-one-y);
      left: var(--newsletter-orange-title-hop-one-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    18% {
      top: var(--newsletter-orange-title-hop-two-apex-y);
      left: var(--newsletter-orange-title-hop-two-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    22% {
      top: var(--newsletter-orange-title-hop-two-y);
      left: var(--newsletter-orange-title-hop-two-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    26% {
      top: var(--newsletter-orange-title-hop-two-y);
      left: var(--newsletter-orange-title-hop-two-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    30% {
      top: var(--newsletter-orange-title-hop-three-apex-y);
      left: var(--newsletter-orange-title-hop-three-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    34%,
    100% {
      top: var(--newsletter-orange-title-hop-three-y);
      left: var(--newsletter-orange-title-hop-three-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }
  }

  @keyframes newsletter-orange-title-spin {
    0%,
    2% {
      rotate: 3960deg;
    }

    6% {
      rotate: 4320deg;
    }

    10%,
    14% {
      rotate: 4680deg;
    }

    18% {
      rotate: 5040deg;
    }

    22%,
    26% {
      rotate: 5400deg;
    }

    30% {
      rotate: 5760deg;
    }

    34%,
    100% {
      rotate: 6120deg;
    }
  }

  @keyframes newsletter-orange-freefall {
    0% {
      top: var(--newsletter-orange-title-hop-three-y);
      left: var(--newsletter-orange-title-hop-three-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    18% {
      top: var(--newsletter-orange-freefall-apex-y);
      left: var(--newsletter-orange-freefall-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    86% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1.08, 0.86);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    90% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateY(-0.45rem) scale(1.02, 0.95);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    93% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateY(0.15rem) scale(0.96, 1.05);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    96% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translate(-0.25rem, -0.1rem) scale(1.04, 0.96);
      animation-timing-function: ease-out;
    }

    98% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateX(0.2rem) scale(0.99, 1.01);
      animation-timing-function: ease-in-out;
    }

    100% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1);
    }
  }

  @keyframes newsletter-orange-freefall-spin {
    0% {
      rotate: var(--newsletter-orange-freefall-spin-start, 6120deg);
    }

    18% {
      rotate: calc(var(--newsletter-orange-freefall-spin-start, 6120deg) + 360deg);
    }

    100% {
      rotate: calc(var(--newsletter-orange-freefall-spin-start, 6120deg) + 1080deg);
    }
  }

  @keyframes newsletter-orange-lower-landing {
    0%,
    18% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    34% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateY(-0.42rem) scale(1.04, 0.94);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    52% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateY(0.12rem) scale(0.97, 1.04);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    70% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translate(-0.12rem, -0.04rem) scale(1.02, 0.98);
      animation-timing-function: ease-out;
    }

    84% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: translateX(0.07rem) scale(0.99, 1.01);
      animation-timing-function: ease-in-out;
    }

    100% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1);
    }
  }

  @keyframes newsletter-orange-lower-landing-spin {
    from,
    to {
      rotate: var(--newsletter-orange-lower-landing-spin-start, 8640deg);
    }
  }

  @keyframes newsletter-orange-return {
    0%,
    4% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    6% {
      top: var(--newsletter-orange-freefall-end-y);
      left: var(--newsletter-orange-freefall-end-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    11% {
      top: var(--newsletter-orange-return-one-apex-y);
      left: var(--newsletter-orange-return-one-apex-x);
      transform: scale(1.03, 0.97);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    16%,
    20% {
      top: var(--newsletter-orange-return-one-y);
      left: var(--newsletter-orange-return-one-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    22% {
      top: var(--newsletter-orange-return-one-y);
      left: var(--newsletter-orange-return-one-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    27% {
      top: var(--newsletter-orange-return-two-apex-y);
      left: var(--newsletter-orange-return-two-apex-x);
      transform: scale(1.03, 0.97);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    32%,
    36% {
      top: var(--newsletter-orange-return-two-y);
      left: var(--newsletter-orange-return-two-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    38% {
      top: var(--newsletter-orange-return-two-y);
      left: var(--newsletter-orange-return-two-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    43% {
      top: var(--newsletter-orange-return-three-apex-y);
      left: var(--newsletter-orange-return-three-apex-x);
      transform: scale(1.03, 0.97);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    48%,
    52% {
      top: var(--newsletter-orange-return-three-y);
      left: var(--newsletter-orange-return-three-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    54% {
      top: var(--newsletter-orange-return-three-y);
      left: var(--newsletter-orange-return-three-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    59% {
      top: var(--newsletter-orange-return-four-apex-y);
      left: var(--newsletter-orange-return-four-apex-x);
      transform: scale(1.03, 0.97);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    64%,
    68% {
      top: var(--newsletter-orange-return-four-y);
      left: var(--newsletter-orange-return-four-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    70% {
      top: var(--newsletter-orange-return-four-y);
      left: var(--newsletter-orange-return-four-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    75% {
      top: var(--newsletter-orange-return-five-apex-y);
      left: var(--newsletter-orange-return-five-apex-x);
      transform: scale(1.03, 0.97);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    80%,
    84%,
    100% {
      top: var(--newsletter-orange-return-five-y);
      left: var(--newsletter-orange-return-five-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }
  }

  @keyframes newsletter-orange-return-spin {
    0%,
    4% {
      rotate: var(--newsletter-orange-return-spin-start, 8640deg);
    }

    6% {
      rotate: var(--newsletter-orange-return-spin-start, 8640deg);
    }

    11% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 720deg);
    }

    16%,
    20% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 1440deg);
    }

    22% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 1440deg);
    }

    27% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 2160deg);
    }

    32%,
    36% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 2880deg);
    }

    38% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 2880deg);
    }

    43% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 3600deg);
    }

    48%,
    52% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 4320deg);
    }

    54% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 4320deg);
    }

    59% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 5040deg);
    }

    64%,
    68%,
    70% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 5760deg);
    }

    75% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 6480deg);
    }

    80%,
    84%,
    100% {
      rotate: calc(var(--newsletter-orange-return-spin-start, 8640deg) - 7200deg);
    }
  }

  @keyframes newsletter-orange-loop {
    0%,
    2% {
      top: var(--newsletter-orange-lower-platform-approach-y);
      left: var(--newsletter-orange-lower-platform-approach-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    6% {
      top: var(--newsletter-orange-lower-platform-approach-y);
      left: var(--newsletter-orange-lower-platform-approach-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    12.3% {
      top: var(--newsletter-orange-lower-platform-approach-apex-y);
      left: var(--newsletter-orange-lower-platform-approach-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    21.7%,
    24% {
      top: var(--newsletter-orange-step-one-y);
      left: var(--newsletter-orange-step-one-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    26% {
      top: var(--newsletter-orange-step-one-y);
      left: var(--newsletter-orange-step-one-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    30% {
      top: var(--newsletter-orange-step-two-apex-y);
      left: var(--newsletter-orange-step-two-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    34%,
    38% {
      top: var(--newsletter-orange-step-two-y);
      left: var(--newsletter-orange-step-two-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    42% {
      top: var(--newsletter-orange-step-two-y);
      left: var(--newsletter-orange-step-two-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    46% {
      top: var(--newsletter-orange-letter-apex-y);
      left: var(--newsletter-orange-letter-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    50%,
    54% {
      top: var(--newsletter-orange-letter-y);
      left: var(--newsletter-orange-letter-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    58% {
      top: var(--newsletter-orange-letter-y);
      left: var(--newsletter-orange-letter-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    60% {
      top: var(--newsletter-orange-title-hop-one-apex-y);
      left: var(--newsletter-orange-title-hop-one-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    66%,
    70% {
      top: var(--newsletter-orange-title-hop-one-y);
      left: var(--newsletter-orange-title-hop-one-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    74% {
      top: var(--newsletter-orange-title-hop-one-y);
      left: var(--newsletter-orange-title-hop-one-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    76% {
      top: var(--newsletter-orange-title-hop-two-apex-y);
      left: var(--newsletter-orange-title-hop-two-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    82%,
    86% {
      top: var(--newsletter-orange-title-hop-two-y);
      left: var(--newsletter-orange-title-hop-two-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }

    90% {
      top: var(--newsletter-orange-title-hop-two-y);
      left: var(--newsletter-orange-title-hop-two-x);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    }

    92% {
      top: var(--newsletter-orange-title-hop-three-apex-y);
      left: var(--newsletter-orange-title-hop-three-apex-x);
      transform: scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    98%,
    100% {
      top: var(--newsletter-orange-title-hop-three-y);
      left: var(--newsletter-orange-title-hop-three-x);
      transform: scale(1);
      animation-timing-function: step-end;
    }
  }

  @keyframes newsletter-orange-loop-spin {
    0%,
    2% {
      rotate: var(--newsletter-orange-loop-spin-start, 10440deg);
    }

    6% {
      rotate: var(--newsletter-orange-loop-spin-start, 10440deg);
    }

    12.3% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 540deg);
    }

    21.7%,
    24% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1080deg);
    }

    26% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1080deg);
    }

    30% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1620deg);
    }

    34%,
    38% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1800deg);
    }

    42% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1800deg);
    }

    46% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1620deg);
    }

    50%,
    54% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1440deg);
    }

    58% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1440deg);
    }

    60% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1260deg);
    }

    66%,
    70% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1080deg);
    }

    74% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 1080deg);
    }

    76% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 900deg);
    }

    82%,
    86% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 720deg);
    }

    90% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 720deg);
    }

    92% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 540deg);
    }

    98%,
    100% {
      rotate: calc(var(--newsletter-orange-loop-spin-start, 10440deg) - 360deg);
    }
  }

  @keyframes newsletter-orange-loop-freefall-trigger {
    from,
    to {
      opacity: 1;
    }
  }

  @keyframes newsletter-orange-freefall-trigger {
    from,
    to {
      opacity: 1;
    }
  }

  /* GOD lands on the description, climbs across the title, drops to the
   * footer, then comes back from right to left behind the form. Every landing
   * is held briefly so each hop reads as intentional. */
  @keyframes newsletter-orange-route-loop {
    0%,
    4% {
      top: var(--newsletter-orange-setup-y);
      left: var(--newsletter-orange-setup-x);
      transform: rotate(2160deg) scale(1);
      animation-timing-function: step-end;
    }

    6% {
      top: var(--newsletter-orange-apex-1-y);
      left: var(--newsletter-orange-apex-1-x);
      transform: rotate(2340deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    8%,
    12% {
      top: var(--newsletter-orange-landing-1-y);
      left: var(--newsletter-orange-landing-1-x);
      transform: rotate(2520deg) scale(1);
      animation-timing-function: step-end;
    }

    14% {
      top: var(--newsletter-orange-apex-2-y);
      left: var(--newsletter-orange-apex-2-x);
      transform: rotate(2700deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    16%,
    20% {
      top: var(--newsletter-orange-landing-2-y);
      left: var(--newsletter-orange-landing-2-x);
      transform: rotate(2880deg) scale(1);
      animation-timing-function: step-end;
    }

    22% {
      top: var(--newsletter-orange-apex-3-y);
      left: var(--newsletter-orange-apex-3-x);
      transform: rotate(3060deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    24%,
    28% {
      top: var(--newsletter-orange-landing-3-y);
      left: var(--newsletter-orange-landing-3-x);
      transform: rotate(3240deg) scale(1);
      animation-timing-function: step-end;
    }

    30% {
      top: var(--newsletter-orange-apex-4-y);
      left: var(--newsletter-orange-apex-4-x);
      transform: rotate(3420deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    32%,
    36% {
      top: var(--newsletter-orange-landing-4-y);
      left: var(--newsletter-orange-landing-4-x);
      transform: rotate(3600deg) scale(1);
      animation-timing-function: step-end;
    }

    38% {
      top: var(--newsletter-orange-apex-5-y);
      left: var(--newsletter-orange-apex-5-x);
      transform: rotate(3780deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    40%,
    44% {
      top: var(--newsletter-orange-landing-5-y);
      left: var(--newsletter-orange-landing-5-x);
      transform: rotate(3960deg) scale(1);
      animation-timing-function: step-end;
    }

    47% {
      top: var(--newsletter-orange-apex-6-y);
      left: var(--newsletter-orange-apex-6-x);
      transform: rotate(4140deg) scale(1.06, 0.92);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    50%,
    54% {
      top: var(--newsletter-orange-ground-top);
      left: var(--newsletter-orange-fall-x);
      transform: rotate(4320deg) scale(1);
      animation-timing-function: step-end;
    }

    58% {
      top: var(--newsletter-orange-apex-7-y);
      left: var(--newsletter-orange-apex-7-x);
      transform: rotate(4500deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    64%,
    68% {
      top: var(--newsletter-orange-return-one-y);
      left: var(--newsletter-orange-return-one-x);
      transform: rotate(4680deg) scale(1);
      animation-timing-function: step-end;
    }

    72% {
      top: var(--newsletter-orange-apex-8-y);
      left: var(--newsletter-orange-apex-8-x);
      transform: rotate(4860deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    78%,
    82% {
      top: var(--newsletter-orange-return-two-y);
      left: var(--newsletter-orange-return-two-x);
      transform: rotate(5040deg) scale(1);
      animation-timing-function: step-end;
    }

    86% {
      top: var(--newsletter-orange-apex-9-y);
      left: var(--newsletter-orange-apex-9-x);
      transform: rotate(5220deg) scale(1.08, 0.9);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    92%,
    100% {
      top: var(--newsletter-orange-setup-y);
      left: var(--newsletter-orange-setup-x);
      transform: rotate(5400deg) scale(1);
      animation-timing-function: step-end;
    }
  }

  @keyframes newsletter-orange-hop-momentum {
    0%,
    8%,
    16%,
    24%,
    32%,
    40%,
    50%,
    64%,
    78%,
    92%,
    100% {
      transform: translate(2rem, 1.8rem) scale(0.82);
    }

    6%,
    14%,
    22%,
    30%,
    38%,
    47%,
    58%,
    72%,
    86% {
      transform: translate(-1.7rem, -2rem) scale(1.12);
    }
  }

  /* The orange signal arcs through the heading (behind it) and lands on the
   * description line, whose platforms now mark each landing. */
  @keyframes newsletter-orange-description-route {
    0%,
    2%,
    8%,
    10%,
    18%,
    20%,
    28%,
    30%,
    38%,
    40%,
    48%,
    50%,
    56%,
    64%,
    70.3%,
    76.6%,
    82.9%,
    90%,
    96%,
    100% {
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      top: 60%;
    }

    4%,
    14%,
    24%,
    34%,
    44%,
    52%,
    58%,
    66.1%,
    72.4%,
    78.7%,
    85%,
    92%,
    97.5% {
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      top: 14%;
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
    .newsletter-creature::before,
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
