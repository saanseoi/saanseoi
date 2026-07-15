<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section class={cn('landing-feature-section', className)}>
  {@render children?.()}
</section>

<style>
:global {
  .landing-architecture:not(.landing-architecture-active) .principle-animation *,
  .landing-architecture:not(.landing-architecture-active) .principle-animation::before,
  .landing-architecture:not(.landing-architecture-active) .principle-animation::after {
    animation-play-state: paused;
  }

  .landing-architecture .landing-section-header,
  .landing-architecture .principles-deck {
    transition:
      opacity 480ms ease,
      translate 560ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .landing-architecture:not(.landing-architecture-revealed) .landing-section-header,
  .landing-architecture:not(.landing-architecture-revealed) .principles-deck {
    opacity: 0;
    translate: 0 1rem;
  }

  .landing-architecture.landing-architecture-revealed .principles-deck {
    transition-delay: 100ms;
  }
  .landing-architecture {
    overflow-x: clip;
    scroll-margin-top: 5.5rem;
  }

  :global(html:not(.dark)) .landing-architecture {
    background-color: #fcf9f5;
    background-image:
      radial-gradient(
        ellipse 38rem 24rem at 4% 84%,
        rgb(111 217 190 / 0.16),
        transparent 72%
      ),
      radial-gradient(
        ellipse 34rem 22rem at 96% 16%,
        rgb(255 181 149 / 0.14),
        transparent 72%
      );
  }

  .architecture-panel {
    --landing-header-height: 4.5rem;
    display: flex;
    isolation: isolate;
    width: 100%;
    max-width: var(--spacing-container-max);
    min-height: max(42.75rem, calc(100svh - var(--landing-header-height)));
    flex-direction: column;
    justify-content: flex-start;
    margin-inline: auto;
    padding: calc(clamp(2.25rem, 5svh, 3.5rem) + 24px) 1.5rem 4rem;
  }

  .landing-section-header {
    position: relative;
    z-index: 0;
    display: block;
    gap: 1.5rem;
    padding-bottom: 1.5rem;
  }

  .landing-section-header h2 {
    max-width: 15ch;
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 4.05vw, 4.2rem);
    font-weight: 800;
    line-height: 0.92;
    color: var(--primary);
  }

  .landing-section-header p:not(.landing-section-eyebrow) {
    max-width: 42rem;
    margin-top: 1rem;
    font-family: var(--font-body);
    font-size: clamp(1rem, 1.4vw, 1.14rem);
    line-height: 1.8;
    color: var(--foreground-alt);
  }

  @media (min-width: 768px) {
    .architecture-panel {
      padding: calc(clamp(2.75rem, 5.5svh, 4rem) + 24px) 2rem 5rem;
    }
  }

  .principles-deck {
    z-index: 1;
    width: 100vw;
    height: 31.5rem;
    isolation: isolate;
    margin-left: calc(50% - 50vw);
    margin-top: auto;
    margin-bottom: auto;
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
    transition: height 500ms ease;
  }

  .principles-deck::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    content: "";
    opacity: 0.04;
    background-image: radial-gradient(var(--secondary) 1px, transparent 1px);
    background-size: 1.2rem 1.2rem;
  }

  :global(html:not(.dark)) .principles-deck::before {
    z-index: 0;
    opacity: 0.1;
    pointer-events: none;
  }

  .principle-card {
    position: absolute;
    z-index: 1;
    display: flex;
    top: 7rem;
    left: 0;
    width: min(18rem, 26vw);
    height: 22rem;
    cursor: pointer;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--outline-variant) 84%, transparent);
    padding: 1.35rem;
    text-align: left;
    box-shadow:
      0 0.7rem 1.6rem rgb(24 25 25 / 0.1),
      var(--shadow-mini);
    transition:
      top 500ms ease,
      left 500ms ease,
      width 500ms ease,
      transform 500ms ease,
      border-color 200ms ease,
      height 500ms ease,
      opacity 300ms ease,
      box-shadow 300ms ease;
  }

  .principle-card:hover,
  .principle-card:focus-visible {
    border-color: color-mix(in srgb, var(--secondary) 45%, var(--outline-variant));
    outline: none;
  }

  .principle-card-dark:hover,
  .principle-card-dark:focus-visible {
    border-color: color-mix(
      in srgb,
      var(--on-tertiary-container) 34%,
      var(--outline-variant)
    );
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--on-tertiary-container) 26%, transparent),
      var(--shadow-mini);
  }

  .principle-card-1 {
    background: #e9f7ef;
    border-color: color-mix(in srgb, var(--secondary) 42%, #ffffff);
    color: var(--primary);
    left: calc(50% - 29.75rem);
    transform: translateY(0.3rem) rotate(-3.5deg);
  }

  .principle-card-2 {
    background: #fff0e6;
    border-color: color-mix(in srgb, var(--on-tertiary-container) 24%, #ffffff);
    color: var(--primary);
    left: calc(50% - 15.6rem);
    transform: translateY(1.5rem) rotate(1.8deg);
  }

  .principle-card-3 {
    background: #e9f7ef;
    border-color: color-mix(in srgb, var(--secondary) 42%, #ffffff);
    color: var(--primary);
    left: calc(50% - 1.4rem);
    transform: translateY(-0.5rem) rotate(-1.4deg);
  }

  .principle-card-4 {
    background: #f8efe3;
    border-color: color-mix(in srgb, var(--on-tertiary-container) 20%, #ffffff);
    color: var(--primary);
    left: calc(50% + 12.75rem);
    transform: translateY(1rem) rotate(3.2deg);
  }

  .principle-card-1:hover,
  .principle-card-1:focus-visible {
    transform: translateY(0) rotate(-1deg);
  }

  .principle-card-2:hover,
  .principle-card-2:focus-visible {
    transform: translateY(1.2rem) rotate(0.8deg);
  }

  .principle-card-3:hover,
  .principle-card-3:focus-visible {
    transform: translateY(-0.8rem) rotate(-0.5deg);
  }

  .principle-card-4:hover,
  .principle-card-4:focus-visible {
    transform: translateY(0.7rem) rotate(1.1deg);
  }

  .principles-deck-expanded .principle-card {
    top: 29.1rem;
    width: min(16.25rem, 23vw);
    height: 13.25rem;
    justify-content: flex-start;
    padding: 1rem;
    opacity: 0.72;
  }

  .principles-deck-expanded {
    height: 44.25rem;
  }

  .principles-deck-expanded .principle-card-active,
  .principle-card-active {
    position: absolute;
    top: 1rem;
    left: 50%;
    z-index: 5;
    width: min(26rem, 100%);
    height: 27rem;
    justify-content: flex-start;
    opacity: 1;
    box-shadow: 0 1.25rem 3rem rgb(0 0 0 / 0.18);
    transform: translateX(-50%) rotate(0deg);
    transform-origin: top center;
  }

  .principles-deck-expanded .principle-card:not(.principle-card-active) {
    pointer-events: auto;
  }

  .principles-deck-expanded .principle-card-1:not(.principle-card-active) {
    left: calc(50% - 28.8rem);
    transform: translateY(0.3rem) rotate(-3.5deg);
  }

  .principles-deck-expanded .principle-card-2:not(.principle-card-active) {
    left: calc(50% - 15.6rem);
    transform: translateY(1.2rem) rotate(1.8deg);
  }

  .principles-deck-expanded .principle-card-3:not(.principle-card-active) {
    left: calc(50% - 2.4rem);
    transform: translateY(-0.4rem) rotate(-1.4deg);
  }

  .principles-deck-expanded .principle-card-4:not(.principle-card-active) {
    left: calc(50% + 10.8rem);
    transform: translateY(0.9rem) rotate(3.2deg);
  }

  .principles-deck-active-1 .principle-card-2:not(.principle-card-active),
  .principles-deck-active-2 .principle-card-1:not(.principle-card-active),
  .principles-deck-active-3 .principle-card-1:not(.principle-card-active),
  .principles-deck-active-4 .principle-card-1:not(.principle-card-active) {
    left: calc(50% - 20.1rem);
    transform: translateY(0.3rem) rotate(-3.5deg);
  }

  .principles-deck-active-1 .principle-card-3:not(.principle-card-active),
  .principles-deck-active-2 .principle-card-3:not(.principle-card-active),
  .principles-deck-active-3 .principle-card-2:not(.principle-card-active),
  .principles-deck-active-4 .principle-card-2:not(.principle-card-active) {
    left: calc(50% - 8rem);
    transform: translateY(1.2rem) rotate(1.8deg);
  }

  .principles-deck-active-1 .principle-card-4:not(.principle-card-active),
  .principles-deck-active-2 .principle-card-4:not(.principle-card-active),
  .principles-deck-active-3 .principle-card-4:not(.principle-card-active),
  .principles-deck-active-4 .principle-card-3:not(.principle-card-active) {
    left: calc(50% + 4.1rem);
    transform: translateY(-0.4rem) rotate(-1.4deg);
  }

  .principles-deck-expanded .principle-card-active:hover,
  .principles-deck-expanded .principle-card-active:focus-visible {
    transform: translateX(-50%) rotate(0deg);
  }

  .principle-card-copy {
    position: relative;
    z-index: 2;
    padding-inline: 0.4rem;
  }

  .principle-card-body {
    display: block;
    max-height: 0;
    color: rgb(40 37 32 / 0.76);
    opacity: 0;
    pointer-events: none;
    transition:
      max-height 450ms ease,
      opacity 180ms ease;
  }

  .principle-card-active .principle-card-body {
    max-height: none;
    margin-top: 0.75rem;
    opacity: 1;
    pointer-events: auto;
    line-height: 1.45;
    transition-delay: 0ms, 450ms;
  }

  .principle-card .principle-card-body-visible {
    max-height: none;
    opacity: 1;
  }

  .principle-corner {
    position: absolute;
    width: 1.1rem;
    height: 1.1rem;
    border-style: solid;
    border-width: 0;
    border-color: var(--secondary);
    opacity: 0.55;
  }

  .principle-card-1 .principle-corner {
    top: -0.45rem;
    left: -0.45rem;
    border-top-width: 1px;
    border-left-width: 1px;
  }

  .principle-card-2 .principle-corner,
  .principle-card-4 .principle-corner {
    right: -0.45rem;
    bottom: -0.45rem;
    border-right-width: 1px;
    border-bottom-width: 1px;
  }

  .principle-card-3 .principle-corner {
    display: none;
    top: 0.7rem;
    right: 0.7rem;
    border-top-width: 1px;
    border-right-width: 1px;
    opacity: 0.25;
  }

  .principle-animation {
    position: relative;
    display: block;
    height: 10.5rem;
    margin-bottom: 1.25rem;
    overflow: hidden;
    border-radius: 0.65rem;
    opacity: 0.94;
  }

  .principle-card-active .principle-animation {
    flex-shrink: 0;
    height: 16rem;
    margin-bottom: 0.25rem;
  }

  .principles-deck-expanded
    .principle-card:not(.principle-card-active)
    .principle-animation {
    height: 6.6rem;
    margin-bottom: 0.8rem;
  }

  .principle-animation-ticker {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-auto-rows: 1.22rem;
    gap: 0.18rem;
    align-content: start;
    padding: 0.7rem;
    background: #164438;
  }

  .principle-animation-ticker .ticker-tile {
    position: relative;
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    background: #205647;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.82rem;
    font-weight: 800;
    color: color-mix(in srgb, var(--secondary-fixed) 66%, transparent);
    opacity: 1;
  }

  .ticker-scan,
  .ticker-scan::before {
    position: absolute;
    inset: 0;
  }

  .ticker-scan {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    content: attr(data-char);
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
    content: attr(data-char);
    position: relative;
    z-index: 1;
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

  .principle-animation-growth {
    background: #482719;
    color: #ffb595;
  }

  .principle-animation-growth span {
    position: absolute;
    inset: 35%;
    border: 2px solid currentColor;
    animation: hollow-grow 4.2s ease-in-out infinite;
  }

  .principle-animation-growth span:nth-child(1) {
    animation-name: hollow-grow-wide;
  }

  .principle-animation-growth span:nth-child(2) {
    animation-delay: -1.4s;
    animation-name: hollow-grow-tall;
    transform: rotate(45deg);
  }

  .principle-animation-growth span:nth-child(3) {
    top: 50%;
    right: auto;
    bottom: auto;
    left: 50%;
    width: 42%;
    aspect-ratio: 1;
    border-radius: 999px;
    animation: enrichment-ring-pulse 3.6s ease-in-out infinite;
  }

  .principle-animation-provenance {
    overflow: hidden;
    background:
      linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--secondary-fixed) 16%, transparent),
        transparent
      ),
      #164438;
  }

  .principle-animation-provenance svg {
    position: absolute;
    inset: 0;
    width: 200%;
    height: 100%;
    color: var(--secondary-fixed);
  }

  .branch-loop {
    transform-origin: center;
    animation: branch-scroll 5.6s linear infinite;
  }

  .branch-curve {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .branch-curve {
    stroke-width: 2;
    opacity: 0.62;
  }

  .branch-baseline {
    opacity: 0.5;
  }

  .branch-curve-secondary {
    opacity: 0.42;
  }

  .principle-animation-provenance circle,
  .branch-node {
    fill: var(--secondary-fixed);
    filter: drop-shadow(
      0 0 0.28rem color-mix(in srgb, var(--secondary-fixed) 45%, transparent)
    );
    opacity: 0.9;
  }

  .branch-node-secondary {
    opacity: 0.72;
  }

  .principle-animation-cubes {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
    padding: 0.5rem;
    background: #482719;
  }

  .principle-animation-cubes::before {
    position: absolute;
    inset: 0.5rem;
    pointer-events: none;
    content: "";
    border: 1px solid color-mix(in srgb, var(--tertiary-fixed-dim) 48%, transparent);
    opacity: 0.36;
    animation: persistence-frame 4s ease-in-out infinite;
  }

  .principle-animation-cubes span {
    position: relative;
    z-index: 1;
    background: color-mix(in srgb, var(--tertiary-fixed-dim) 72%, #5a2b1a);
    transform-origin: center;
    animation: cube-contort-restore 4s ease-in-out infinite;
    animation-delay: calc(var(--cube-index) * 28ms);
    animation-fill-mode: both;
  }

  /* Keep the original dark-mode deck independent from the light-mode palette. */
  :global(.dark) .principle-card {
    border-color: color-mix(in srgb, var(--outline-variant) 70%, transparent);
    box-shadow: var(--shadow-mini);
  }

  :global(.dark) .principle-card-paper {
    background: #101816;
    color: var(--primary);
  }

  :global(.dark) .principle-card-dark {
    background: #242321;
    color: var(--primary);
  }

  :global(.dark) .principle-card .principle-card-body {
    color: var(--foreground-alt);
  }

  :global(.dark) .principle-card-dark:hover,
  :global(.dark) .principle-card-dark:focus-visible {
    border-color: color-mix(in srgb, var(--tertiary) 72%, var(--outline-variant));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--tertiary) 54%, transparent),
      var(--shadow-mini);
  }

  :global(.dark) .principle-animation-ticker {
    background: color-mix(in srgb, var(--secondary) 13%, transparent);
  }

  :global(.dark) .principle-animation-ticker .ticker-tile {
    background: color-mix(in srgb, var(--secondary) 10%, transparent);
    color: color-mix(in srgb, #8cf6da 14%, transparent);
  }

  :global(.dark) .ticker-scan {
    color: #8cf6da;
  }

  :global(.dark) .principle-animation-growth {
    background: color-mix(in srgb, var(--tertiary) 13%, transparent);
    color: var(--tertiary);
  }

  :global(.dark) .principle-animation-provenance {
    background:
      linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--secondary) 8%, transparent),
        transparent
      ),
      color-mix(in srgb, var(--secondary) 10%, transparent);
  }

  :global(.dark) .principle-animation-provenance svg {
    color: #8cf6da;
  }

  :global(.dark) .principle-animation-provenance circle,
  :global(.dark) .branch-node {
    fill: #8cf6da;
    filter: drop-shadow(0 0 0.28rem color-mix(in srgb, #8cf6da 55%, transparent));
  }

  :global(.dark) .principle-animation-cubes {
    background: color-mix(in srgb, var(--tertiary) 18%, transparent);
  }

  :global(.dark) .principle-animation-cubes::before {
    border-color: color-mix(in srgb, var(--tertiary) 38%, transparent);
  }

  :global(.dark) .principle-animation-cubes span {
    background: color-mix(in srgb, var(--tertiary) 72%, var(--surface-container));
  }

  @keyframes ticker-character-fade {
    0% {
      opacity: 1;
      color: #8cf6da;
      transform: translateY(0);
    }
    33.333% {
      opacity: 0;
      color: color-mix(in srgb, #8cf6da 14%, transparent);
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      color: color-mix(in srgb, #8cf6da 14%, transparent);
      transform: translateY(0);
    }
  }

  @keyframes ticker-background-flash {
    0% {
      opacity: 1;
    }
    16.666% {
      opacity: 0;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes hollow-grow-wide {
    0% {
      inset: 42% 36%;
      opacity: 0;
      transform: rotate(0deg);
    }
    35% {
      opacity: 0.72;
    }
    100% {
      inset: -18% -8%;
      opacity: 0;
      transform: rotate(110deg);
    }
  }

  @keyframes hollow-grow-tall {
    0% {
      inset: 38% 44%;
      opacity: 0;
      transform: rotate(45deg);
    }
    35% {
      opacity: 0.68;
    }
    100% {
      inset: -10% 8%;
      opacity: 0;
      transform: rotate(155deg);
    }
  }

  @keyframes hollow-grow {
    0% {
      inset: 42%;
      opacity: 0;
      transform: rotate(0deg);
    }
    35% {
      opacity: 0.72;
    }
    100% {
      inset: -18%;
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

  @keyframes cube-contort-restore {
    0%,
    12% {
      transform: translate3d(0, 0, 0) skew(0deg, 0deg) rotate(0deg);
      opacity: 0.84;
    }
    46% {
      transform: translate3d(
          calc((var(--cube-index) - 8) * 0.018rem),
          calc((8 - var(--cube-index)) * 0.012rem),
          0
        )
        skew(-7deg, 2deg) rotate(calc((var(--cube-index) - 8) * 0.4deg));
      opacity: 0.56;
    }
    54% {
      transform: translate3d(
          calc((8 - var(--cube-index)) * 0.026rem),
          calc((var(--cube-index) - 8) * 0.016rem),
          0
        )
        skew(9deg, -3deg) rotate(calc((8 - var(--cube-index)) * 0.28deg));
      opacity: 0.96;
    }
    61% {
      transform: translate3d(
          calc((var(--cube-index) - 8) * 0.006rem),
          calc((8 - var(--cube-index)) * 0.004rem),
          0
        )
        skew(-1.4deg, 0.6deg) rotate(calc((var(--cube-index) - 8) * 0.12deg));
      opacity: 0.88;
    }
    70%,
    100% {
      transform: translate3d(0, 0, 0) skew(0deg, 0deg) rotate(0deg);
      opacity: 0.84;
    }
  }

  @keyframes persistence-frame {
    0%,
    100% {
      opacity: 0.5;
      transform: scale(1);
    }
    45% {
      opacity: 0.18;
      transform: scale(0.985);
    }
  }

  @media (max-width: 900px) {
    .principles-deck {
      height: 35rem;
      display: block;
      overflow: visible;
      margin-top: auto;
      margin-bottom: auto;
      padding-top: 3.25rem;
      padding-bottom: 2rem;
    }

    .principle-card,
    .principle-card-1,
    .principle-card-2,
    .principle-card-3,
    .principle-card-4 {
      position: absolute;
      top: 3.25rem;
      left: 50%;
      width: min(20rem, calc(100vw - 4rem));
      grid-column: auto;
      margin-left: 0;
      height: 26rem;
      padding: 1.35rem;
      justify-content: flex-start;
      touch-action: none;
      transform-origin: center;
    }

    .principles-deck-dragging .principle-stack-position-0 {
      transition:
        border-color 200ms ease,
        box-shadow 300ms ease;
    }

    .principle-stack-position-0,
    .principle-stack-position-0:hover,
    .principle-stack-position-0:focus-visible,
    .principles-deck-expanded .principle-stack-position-0,
    .principles-deck-expanded .principle-stack-position-0:hover,
    .principles-deck-expanded .principle-stack-position-0:focus-visible,
    .principles-deck-expanded .principle-stack-position-0.principle-card-active {
      z-index: 20;
      opacity: 1;
      transform: translateX(-50%) translate(var(--swipe-x), var(--swipe-y))
        rotate(var(--swipe-rotate));
    }

    .principle-stack-position-1,
    .principle-stack-position-1:hover,
    .principle-stack-position-1:focus-visible,
    .principles-deck-expanded .principle-stack-position-1,
    .principles-deck-expanded .principle-stack-position-1:hover,
    .principles-deck-expanded .principle-stack-position-1:focus-visible,
    .principles-deck-expanded .principle-stack-position-1.principle-card-active {
      z-index: 19;
      opacity: 1;
      transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
    }

    .principle-stack-position-2,
    .principle-stack-position-2:hover,
    .principle-stack-position-2:focus-visible,
    .principles-deck-expanded .principle-stack-position-2,
    .principles-deck-expanded .principle-stack-position-2:hover,
    .principles-deck-expanded .principle-stack-position-2:focus-visible,
    .principles-deck-expanded .principle-stack-position-2.principle-card-active {
      z-index: 18;
      opacity: 1;
      transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
    }

    .principle-stack-position-3,
    .principle-stack-position-3:hover,
    .principle-stack-position-3:focus-visible,
    .principles-deck-expanded .principle-stack-position-3,
    .principles-deck-expanded .principle-stack-position-3:hover,
    .principles-deck-expanded .principle-stack-position-3:focus-visible,
    .principles-deck-expanded .principle-stack-position-3.principle-card-active {
      z-index: 17;
      opacity: 1;
      transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
    }

    .principles-deck-throwing .principle-stack-position-1,
    .principles-deck-throwing .principle-stack-position-1:hover,
    .principles-deck-throwing .principle-stack-position-1:focus-visible {
      z-index: 20;
      transform: translateX(-50%) translate(0, 0) rotate(0deg);
    }

    .principles-deck-throwing .principle-stack-position-2,
    .principles-deck-throwing .principle-stack-position-2:hover,
    .principles-deck-throwing .principle-stack-position-2:focus-visible {
      z-index: 19;
      transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
    }

    .principles-deck-throwing .principle-stack-position-3,
    .principles-deck-throwing .principle-stack-position-3:hover,
    .principles-deck-throwing .principle-stack-position-3:focus-visible {
      z-index: 18;
      transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
    }

    .principles-deck-throwing .principle-card-throwing-away,
    .principles-deck-throwing .principle-card-throwing-away:hover,
    .principles-deck-throwing .principle-card-throwing-away:focus-visible,
    .principles-deck-expanded.principles-deck-throwing .principle-card-throwing-away {
      z-index: 17;
      opacity: 1;
      transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
    }

    .principles-deck-expanded .principle-card,
    .principles-deck-expanded .principle-card-active,
    .principle-card-active {
      top: 3.25rem;
      left: 50%;
      width: min(20rem, calc(100vw - 4rem));
      height: 26rem;
      justify-content: flex-start;
      padding: 1.35rem;
      box-shadow: var(--shadow-mini);
    }

    .principle-card-body,
    .principle-card .principle-card-body-visible {
      max-height: none;
      opacity: 1;
    }

    .principle-card-copy {
      margin-top: 0;
    }

    .principle-card-body {
      margin-top: 0.75rem;
      line-height: 1.45;
      transition-delay: 0ms;
    }

    .principle-card-active .principle-animation,
    .principle-animation,
    .principles-deck-expanded
      .principle-card:not(.principle-card-active)
      .principle-animation {
      height: 10.5rem;
      margin-bottom: 0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing-architecture .landing-section-header,
    .landing-architecture .principles-deck {
      transition: none;
    }

    .landing-architecture:not(.landing-architecture-revealed) .landing-section-header,
    .landing-architecture:not(.landing-architecture-revealed) .principles-deck {
      opacity: 1;
      translate: 0;
    }

    .principle-animation *,
    .principle-animation::before,
    .principle-animation::after {
      animation: none;
    }
  }
}
</style>
