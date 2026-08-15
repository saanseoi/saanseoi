<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideExpandablePattern from '../../components/shared/guideExpandablePattern.svelte'
import GuideTerminalDemo from './guideTerminalDemo.svelte'

type OperatingSystem = 'windows' | 'macos' | 'linux'

type Props = { operatingSystem?: OperatingSystem }

let { operatingSystem }: Props = $props()

const terminalInstructions = $derived(
  operatingSystem === 'windows'
    ? {
        navigation: m.guide_terminal_intro_navigation_windows(),
        open: m.guide_terminal_intro_open_windows(),
        paste: m.guide_terminal_intro_paste_windows(),
      }
    : operatingSystem === 'macos'
      ? {
          navigation: m.guide_terminal_intro_navigation_unix(),
          open: m.guide_terminal_intro_open_macos(),
          paste: m.guide_terminal_intro_paste_macos(),
        }
      : {
          navigation: m.guide_terminal_intro_navigation_unix(),
          open: m.guide_terminal_intro_open_linux(),
          paste: m.guide_terminal_intro_paste_linux(),
        },
)
const terminalLearningResource = $derived(
  operatingSystem === 'windows'
    ? {
        label: m.guide_terminal_intro_learn_more_windows(),
        url: 'https://learn.microsoft.com/powershell/scripting/learn/ps101/00-introduction',
      }
    : {
        label: m.guide_terminal_intro_learn_more(),
        url: 'https://www.learnenough.com/command-line-tutorial',
      },
)
let expanded = $state(true)
</script>

<GuideExpandablePattern
  bind:expanded
  contentId="terminal-introduction-content"
  bannerLabel="TERMINAL 101"
  bannerPrompt="$ make something --wonderful_"
  title={m.guide_terminal_intro_title()}
>
  <div class="terminal-introduction__hero">
    <div>
      <p class="terminal-introduction__eyebrow">01 / Getting started</p>
      <p class="mt-3 max-w-xl font-body text-body-md leading-7 text-foreground-alt">
        {@html m.guide_terminal_intro_description()}
      </p>
    </div>

    <div
      class="terminal-introduction__comparison"
      aria-label="Graphical application compared with a terminal"
      role="img"
    >
      <div class="application-window">
        <span class="application-window__label">GUI</span>
        <div class="application-window__toolbar">
          <span></span><span></span><span></span>
        </div>
        <div class="application-window__content">
          <span></span><span></span><span></span><span></span>
        </div>
        <Icon
          class="application-window__cursor"
          icon="material-symbols-light:mouse-rounded"
          aria-hidden="true"
        />
      </div>
      <div class="comparison-arrow" aria-hidden="true">
        <Icon icon="material-symbols-light:arrow-forward-alt-rounded" />
      </div>
      <div class="mini-terminal">
        <span class="mini-terminal__label">Terminal</span>
        <p><span>$</span> open project</p>
        <p><span>✓</span> Done</p>
      </div>
    </div>
  </div>

  <div class="terminal-introduction__open">
    <p class="terminal-introduction__eyebrow">
      {@html m.guide_terminal_intro_open_eyebrow()}
    </p>
    <div class="terminal-introduction__open-heading">
      <h4 class="font-display text-headline-sm font-bold text-primary">
        {@html m.guide_terminal_intro_open_title()}
      </h4>
      <Icon
        class="terminal-introduction__open-icon"
        icon="material-symbols-light:terminal-rounded"
        aria-hidden="true"
      />
    </div>
    <div class="terminal-introduction__open-instructions">
      {@html terminalInstructions.open}
    </div>
  </div>

  <div class="mt-10">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="terminal-introduction__eyebrow">03 / A few useful moves</p>
        <h4 class="font-display text-headline-sm font-bold text-primary">
          {@html m.guide_terminal_intro_basics_title()}
        </h4>
      </div>
      <Icon
        class="mb-1 size-7 text-secondary"
        icon="material-symbols-light:keyboard-command-key-rounded"
        aria-hidden="true"
      />
    </div>

    <div
      class:terminal-introduction__essentials--windows={operatingSystem === 'windows'}
      class="terminal-introduction__essentials"
    >
      <article class="terminal-essential">
        <span class="terminal-essential__number">01</span>
        <h5>{@html m.guide_terminal_intro_navigation_title()}</h5>
        <p>{@html terminalInstructions.navigation}</p>
        <GuideTerminalDemo {operatingSystem} variant="navigation" />
      </article>
      <article class="terminal-essential">
        <span class="terminal-essential__number">02</span>
        <h5>{@html m.guide_terminal_intro_completion_title()}</h5>
        <p>{@html m.guide_terminal_intro_completion()}</p>
        <GuideTerminalDemo {operatingSystem} variant="completion" />
      </article>
      <article class="terminal-essential">
        <span class="terminal-essential__number">03</span>
        <h5>{@html m.guide_terminal_intro_history_title()}</h5>
        <p>{@html m.guide_terminal_intro_history()}</p>
        <GuideTerminalDemo {operatingSystem} variant="history" />
      </article>
      <article class="terminal-essential">
        <span class="terminal-essential__number">04</span>
        <h5>{@html m.guide_terminal_intro_interrupt_title()}</h5>
        <p>{@html m.guide_terminal_intro_interrupt()}</p>
        <GuideTerminalDemo {operatingSystem} variant="interrupt" />
      </article>
    </div>

    <aside class="terminal-introduction__paste-warning">
      <Icon icon="material-symbols-light:warning-rounded" aria-hidden="true" />
      <div>
        <h5>{@html m.guide_terminal_intro_paste_title()}</h5>
        <p>{@html terminalInstructions.paste}</p>
      </div>
    </aside>
  </div>

  <div class="terminal-introduction__recovery">
    <div class="terminal-introduction__recovery-heading">
      <div class="terminal-introduction__recovery-icon">
        <Icon icon="material-symbols-light:troubleshoot-rounded" aria-hidden="true" />
      </div>
      <div>
        <p class="terminal-introduction__eyebrow">
          {@html m.guide_terminal_intro_recovery_eyebrow()}
        </p>
        <h4 class="font-display text-headline-sm font-bold text-primary">
          {@html m.guide_terminal_intro_recovery_title()}
        </h4>
      </div>
    </div>
    <ol class="terminal-introduction__troubleshooting-flow">
      <li>
        <span>1</span>
        <p>{@html m.guide_terminal_intro_recovery_read()}</p>
      </li>
      <li>
        <span>2</span>
        <p>{@html m.guide_terminal_intro_recovery_check()}</p>
      </li>
      <li>
        <span>3</span>
        <p>
          {@html m.guide_terminal_intro_recovery_ask_before()}
          <a href="/community">{@html m.guide_join_community()}</a>
          {@html m.guide_terminal_intro_recovery_ask_after()}
        </p>
      </li>
    </ol>
  </div>

  <div class="terminal-introduction__learning">
    <p class="terminal-introduction__eyebrow">
      {@html m.guide_terminal_intro_keep_learning()}
    </p>
    <a
      class="terminal-introduction__learn-more"
      href={terminalLearningResource.url}
      target="_blank"
      rel="noreferrer"
    >
      <span class="terminal-introduction__learn-prompt" aria-hidden="true">$</span>
      <span>{@html terminalLearningResource.label}</span>
      <span class="terminal-introduction__learn-cursor" aria-hidden="true"></span>
    </a>
  </div>
</GuideExpandablePattern>

<style>
.terminal-introduction__hero {
  display: grid;
  gap: 2rem;
  align-items: center;
}
.terminal-introduction__eyebrow {
  margin: 0 0 0.45rem;
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.terminal-introduction__comparison {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.9rem;
  align-items: stretch;
}
.application-window,
.mini-terminal {
  position: relative;
  box-sizing: border-box;
  block-size: 8.75rem;
  border: 1px solid color-mix(in srgb, var(--color-foreground-alt) 45%, transparent);
  background: var(--color-background);
  padding: 1.2rem 0.75rem 0.75rem;
}
.application-window__label,
.mini-terminal__label {
  position: absolute;
  top: -0.7rem;
  left: 0.65rem;
  padding: 0.08rem 0.35rem;
  background: var(--color-secondary);
  color: var(--color-on-secondary);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
}
.application-window__toolbar {
  display: flex;
  gap: 0.25rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--color-border-card);
}
.application-window__toolbar span {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 999px;
  background: var(--color-foreground-alt);
  opacity: 0.65;
}
.application-window__content {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.45rem;
  padding-top: 0.7rem;
}
.application-window__content span {
  min-height: 1.45rem;
  background: color-mix(in srgb, var(--color-secondary) 20%, var(--color-background));
}
.application-window__content span:first-child {
  grid-column: span 2;
  background: var(--color-secondary);
}
.application-window :global(.application-window__cursor) {
  position: absolute;
  right: 0.4rem;
  bottom: 0.35rem;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-primary);
  animation: terminal-introduction-cursor 4.5s ease-in-out infinite;
}
.comparison-arrow {
  display: grid;
  place-items: center;
  color: var(--color-secondary);
}
.comparison-arrow :global(svg) {
  width: 1.4rem;
  height: 1.4rem;
}
.mini-terminal {
  border-color: color-mix(in srgb, var(--color-secondary) 60%, transparent);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  line-height: 1.8;
}
.mini-terminal p {
  margin: 0;
  white-space: nowrap;
}
.mini-terminal p span {
  color: var(--color-secondary);
}
.terminal-introduction__open {
  margin-top: 2.5rem;
}
.terminal-introduction__open-heading {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: center;
}
.terminal-essential__number {
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
}
.terminal-introduction__open :global(.terminal-introduction__open-icon) {
  width: 1.6rem;
  height: 1.6rem;
  color: var(--color-secondary);
}
.terminal-introduction__open-instructions {
  margin: 1rem 0 0;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.7;
}
.terminal-introduction__open-instructions :global(ol) {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1.4rem;
}
.terminal-introduction__open-instructions :global(b) {
  color: var(--color-primary);
}
.terminal-introduction__open-instructions :global(code),
.terminal-essential :global(code) {
  padding: 0.05rem 0.25rem;
  background: color-mix(in srgb, var(--color-secondary) 20%, transparent);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.terminal-introduction__essentials {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
}
.terminal-essential {
  position: relative;
  padding: 1.25rem;
  border: 1px solid var(--color-border-card);
  background: color-mix(in srgb, var(--color-background) 74%, transparent);
}
.terminal-essential h5 {
  margin: 0.4rem 0 0;
  color: var(--color-primary);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
}
.terminal-essential > p {
  min-height: 3.4rem;
  margin: 0.5rem 0 1rem;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.5;
}
.terminal-introduction__paste-warning {
  display: grid;
  width: 100%;
  grid-template-columns: auto 1fr;
  gap: 0.85rem;
  margin-top: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid #ef8b88;
  background: color-mix(in srgb, #ef8b88 12%, var(--color-background));
}
.terminal-introduction__paste-warning > :global(svg) {
  width: 1.45rem;
  height: 1.45rem;
  color: #ef8b88;
}
.terminal-introduction__paste-warning h5 {
  margin: 0;
  color: #ffb4b1;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
}
.terminal-introduction__paste-warning p {
  margin: 0.3rem 0 0;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.9rem;
  line-height: 1.55;
}
.terminal-introduction__paste-warning :global(kbd) {
  display: inline-flex;
  min-height: 1.55em;
  align-items: center;
  justify-content: center;
  padding: 0 0.35em;
  border: 1px solid color-mix(in srgb, #ffb4b1 65%, transparent);
  border-bottom-width: 2px;
  border-radius: 0.2rem;
  background: color-mix(in srgb, #ef8b88 12%, var(--color-background));
  color: #ffe0de;
  font-family: var(--font-mono);
  font-size: 0.78em;
  font-weight: 700;
  line-height: 1;
  vertical-align: 0.06em;
}
.terminal-introduction__recovery {
  margin-top: 2.5rem;
  padding: 1.4rem;
  border-left: 4px solid var(--color-secondary);
  background: color-mix(in srgb, var(--color-background) 68%, transparent);
}
.terminal-introduction__recovery-heading {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: flex-start;
}
.terminal-introduction__recovery-icon {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  flex: none;
  place-items: center;
  background: var(--color-secondary);
  color: var(--color-on-secondary);
}
.terminal-introduction__recovery-icon :global(svg) {
  width: 1.3rem;
  height: 1.3rem;
}
.terminal-introduction__troubleshooting-flow {
  display: grid;
  gap: 0.75rem;
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
}
.terminal-introduction__troubleshooting-flow li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  align-items: start;
}
.terminal-introduction__troubleshooting-flow span {
  display: grid;
  width: 1.65rem;
  height: 1.65rem;
  place-items: center;
  border: 1px solid var(--color-secondary);
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
}
.terminal-introduction__troubleshooting-flow p {
  margin: 0;
  padding-top: 0.1rem;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.55;
}
.terminal-introduction__troubleshooting-flow :global(b) {
  color: var(--color-primary);
}
.terminal-introduction__troubleshooting-flow a {
  color: var(--color-secondary);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.terminal-introduction__learning {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 2.5rem;
  text-align: center;
}
.terminal-introduction__learning .terminal-introduction__eyebrow {
  margin-bottom: 0.75rem;
}
.terminal-introduction__learn-more {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 65%, transparent);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}
.terminal-introduction__learn-prompt {
  color: var(--color-secondary);
}
.terminal-introduction__learn-cursor {
  width: 0.45rem;
  height: 1.1em;
  background: var(--color-secondary);
  animation: terminal-introduction-blink 1s step-end infinite;
}
.terminal-introduction__learn-more:hover {
  background: var(--color-secondary);
  color: var(--color-on-secondary);
}
.terminal-introduction__learn-more:hover .terminal-introduction__learn-prompt {
  color: var(--color-on-secondary);
}
.terminal-introduction__learn-more:hover .terminal-introduction__learn-cursor {
  background: var(--color-on-secondary);
}
@keyframes terminal-introduction-cursor {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-1.1rem, -0.65rem);
  }
}
@keyframes terminal-introduction-blink {
  50% {
    opacity: 0;
  }
}
@media (min-width: 640px) {
  .terminal-introduction__essentials {
    grid-template-columns: repeat(2, 1fr);
  }
  .terminal-introduction__troubleshooting-flow {
    grid-template-columns: repeat(3, 1fr);
  }
  .terminal-introduction__troubleshooting-flow li {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    align-content: start;
    align-items: start;
  }
}
@media (min-width: 768px) {
  .terminal-introduction__hero {
    grid-template-columns: minmax(0, 1.2fr) minmax(19rem, 0.8fr);
  }
  .terminal-introduction__essentials {
    grid-template-columns: repeat(4, 1fr);
  }
  .terminal-introduction__essentials--windows {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 420px) {
  .terminal-introduction__comparison {
    grid-template-columns: 1fr;
  }
  .comparison-arrow {
    transform: rotate(90deg);
  }
  .terminal-introduction__open-instructions {
    margin-left: 0;
  }
  .terminal-introduction__paste-warning {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .application-window :global(.application-window__cursor),
  .terminal-introduction__learn-cursor {
    animation: none;
  }
}
</style>
