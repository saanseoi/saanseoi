<script lang="ts">
import { onMount } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

const discordTopics = [
  { label: () => m.community_spaces_discord_get_help(), icon: 'proicons:chat' },
  { label: () => m.community_spaces_discord_talk_maps(), icon: 'proicons:map' },
  {
    label: () => m.community_spaces_discord_request_datasets(),
    icon: 'proicons:database',
  },
  { label: () => m.community_spaces_discord_share_work(), icon: 'proicons:sparkle' },
] as const

const discussionUses = [
  m.community_spaces_discussions_idea,
  m.community_spaces_discussions_answer,
  m.community_spaces_discussions_proposal,
] as const

let discordFloatIcon = $state<HTMLAnchorElement>()
let discussionsFloatIcon = $state<HTMLAnchorElement>()
let instagramFloatIcon = $state<HTMLAnchorElement>()
let linkedInFloatIcon = $state<HTMLAnchorElement>()
let threadsFloatIcon = $state<HTMLAnchorElement>()

function positionCommunityBadges() {
  const communitySpacesGrid = document.querySelector<HTMLElement>(
    '.community-spaces-grid',
  )
  if (!communitySpacesGrid) return

  const gridRect = communitySpacesGrid.getBoundingClientRect()
  const anchors = [
    {
      badgeSelector: '.community-space-float-icon-discord',
      cardSelector: '.community-space-card-discord',
      x: 0.68,
      y: 0.22,
      offsetX: 32,
      leftProperty: '--community-discord-anchor-left',
      topProperty: '--community-discord-anchor-top',
    },
    {
      badgeSelector: '.community-space-float-icon-discussions',
      cardSelector: '.community-space-card-discussions',
      x: 0.16,
      y: 0.28,
      offsetX: 0,
      leftProperty: '--community-discussions-anchor-left',
      topProperty: '--community-discussions-anchor-top',
    },
  ] as const

  for (const anchor of anchors) {
    const badge = document.querySelector<HTMLAnchorElement>(anchor.badgeSelector)
    const card = document.querySelector<HTMLElement>(anchor.cardSelector)
    if (!badge || !card) continue

    const cardRect = card.getBoundingClientRect()
    const anchorX = cardRect.left + cardRect.width * anchor.x + anchor.offsetX
    const anchorY = cardRect.top + cardRect.height * anchor.y
    badge.style.setProperty(
      anchor.leftProperty,
      `${anchorX - gridRect.left - badge.offsetWidth / 2}px`,
    )
    badge.style.setProperty(
      anchor.topProperty,
      `${anchorY - gridRect.top - badge.offsetHeight / 2}px`,
    )
  }
}

onMount(() => {
  const resizeObserver = new ResizeObserver(positionCommunityBadges)
  const observeLayout = () => {
    const discussionsCard = document.querySelector<HTMLElement>(
      '.community-space-card-discussions',
    )
    const communitySpacesGrid = discussionsCard?.closest<HTMLElement>(
      '.community-spaces-grid',
    )
    if (discussionsCard) resizeObserver.observe(discussionsCard)
    if (communitySpacesGrid) resizeObserver.observe(communitySpacesGrid)
    positionCommunityBadges()
  }
  const layoutFrame = window.requestAnimationFrame(observeLayout)
  const layoutTimer = window.setTimeout(observeLayout, 250)

  window.addEventListener('resize', positionCommunityBadges)
  void document.fonts.ready.then(observeLayout)

  return () => {
    resizeObserver.disconnect()
    window.cancelAnimationFrame(layoutFrame)
    window.clearTimeout(layoutTimer)
    window.removeEventListener('resize', positionCommunityBadges)
  }
})

onMount(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const iconMotions: Array<[HTMLAnchorElement | undefined, number]> = [
    [discordFloatIcon, 0],
    [discussionsFloatIcon, Math.PI],
    [instagramFloatIcon, Math.PI / 2],
    [linkedInFloatIcon, (Math.PI * 3) / 2],
    [threadsFloatIcon, Math.PI / 4],
  ]
  const motions = iconMotions.flatMap(([icon, phaseOffset]) =>
    icon ? [{ icon, phase: phaseOffset, speed: 1, isHovering: false }] : [],
  )

  let frame = 0
  let lastFrameAt = performance.now()
  const animate = (now: number) => {
    const elapsed = Math.min((now - lastFrameAt) / 1_000, 0.1)
    lastFrameAt = now

    for (const motion of motions) {
      const targetSpeed = motion.isHovering ? 0 : 1
      const easing = 1 - Math.exp(-4 * elapsed)
      motion.speed += (targetSpeed - motion.speed) * easing
      if (motion.isHovering && motion.speed < 0.015) motion.speed = 0

      motion.phase += elapsed * ((Math.PI * 2) / 10) * motion.speed
      const x = Math.sin(motion.phase) * 10
      const y = Math.sin(motion.phase * 2) * 5
      const tilt = Math.sin(motion.phase) * 2

      motion.icon.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg)`
    }
    frame = window.requestAnimationFrame(animate)
  }

  const hoverListeners = motions.map(motion => {
    const onPointerEnter = () => {
      motion.isHovering = true
    }
    const onPointerLeave = () => {
      motion.isHovering = false
    }

    motion.icon.addEventListener('pointerenter', onPointerEnter)
    motion.icon.addEventListener('pointerleave', onPointerLeave)
    return { icon: motion.icon, onPointerEnter, onPointerLeave }
  })

  frame = window.requestAnimationFrame(animate)
  return () => {
    window.cancelAnimationFrame(frame)
    for (const { icon, onPointerEnter, onPointerLeave } of hoverListeners) {
      icon.removeEventListener('pointerenter', onPointerEnter)
      icon.removeEventListener('pointerleave', onPointerLeave)
    }
  }
})
</script>

<section
  class="community-spaces flex min-h-0 flex-1 flex-col"
  aria-labelledby="community-spaces-title"
>
  <div
    class="community-spaces-grid my-[clamp(1.5rem,3svh,2.5rem)] grid gap-5 lg:grid-cols-[1.08fr_0.92fr]"
  >
    <div
      class="community-space-blob community-space-blob-discord community-space-blob-discord-upper"
      aria-hidden="true"
    ></div>
    <div
      class="community-space-blob community-space-blob-discord community-space-blob-discord-lower"
      aria-hidden="true"
    ></div>
    <div
      class="community-space-blob community-space-blob-discussions community-space-blob-discussions-upper"
      aria-hidden="true"
    ></div>
    <div
      class="community-space-blob community-space-blob-discussions community-space-blob-discussions-lower"
      aria-hidden="true"
    ></div>
    <article
      class="community-space-card community-space-card-discord relative overflow-hidden rounded-[1.6rem] border border-[#5865f2]/35 bg-[#5865f2] p-5 text-white shadow-[0_1.25rem_3rem_rgb(47_53_152/0.2)] sm:p-7"
    >
      <div
        class="community-space-card-discord-ring pointer-events-none absolute -right-10 -top-12 size-48 rounded-full border-[1.5rem] border-white/10"
        aria-hidden="true"
      ></div>
      <div
        class="community-space-card-discord-shade pointer-events-none absolute -bottom-16 left-[40%] size-44 rounded-full bg-[#4752c4]"
        aria-hidden="true"
      ></div>

      <div class="community-space-card-content relative flex h-full min-h-0 flex-col">
        <div
          class="community-space-card-identity flex items-center justify-between gap-4"
        >
          <p
            class="font-body text-[0.72rem] font-bold uppercase tracking-[0.14em] text-white/75"
          >
            {m.community_spaces_discord_eyebrow()}
          </p>
        </div>
        <h3
          class="community-space-card-title font-display text-[clamp(2rem,3vw,3rem)] font-bold leading-none"
        >
          {m.community_spaces_discord_title()}
        </h3>
        <p
          class="community-space-card-description max-w-136 font-body text-[0.98rem] leading-[1.75] text-white/85"
        >
          {m.community_spaces_discord_description()}
        </p>

        <div class="community-space-card-topics grid gap-2 sm:grid-cols-2">
          {#each discordTopics as topic}
            <div
              class="community-space-topic flex items-center gap-3 rounded-xl border border-white/15 bg-[#4752c4]/75 px-3 py-3"
            >
              <span
                class="grid size-7 shrink-0 place-items-center rounded-lg bg-white/13 text-white"
              >
                <Icon icon={topic.icon} class="size-4" aria-hidden="true" />
              </span>
              <span
                class="flex min-w-0 items-center whitespace-nowrap font-body text-[0.86rem] font-semibold leading-none"
                >{topic.label()}</span
              >
            </div>
          {/each}
        </div>

        <div class="community-space-card-footer">
          <a
            class="community-space-card-cta inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 font-body text-[0.93rem] font-bold text-[#3d478f] transition-shadow hover:shadow-[0_0_1.5rem_rgb(255_255_255/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#5865f2]"
            href="https://discord.gg/thXu6psten"
            target="_blank"
            rel="noreferrer"
          >
            <Icon icon="simple-icons:discord" class="size-4" aria-hidden="true" />
            {m.community_spaces_join_discord()}
            <Icon icon="proicons:open-new-window" class="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>

    <article
      class="community-space-card community-space-card-discussions relative overflow-hidden rounded-[1.6rem] border border-border-card bg-surface-container-lowest p-5 shadow-[0_1.25rem_3rem_rgb(0_0_0/0.08)] sm:p-7"
    >
      <div
        class="community-space-card-discussions-shade pointer-events-none absolute -bottom-16 right-[40%] size-44 rounded-full bg-[#087b68]"
        aria-hidden="true"
      ></div>
      <div
        class="community-space-card-discussions-ring pointer-events-none absolute -left-10 -top-12 size-48 rounded-full border-[1.5rem] border-white/10"
        aria-hidden="true"
      ></div>
      <div class="community-space-card-content flex h-full min-h-0 flex-col">
        <div
          class="community-space-card-identity flex items-center justify-between gap-4"
        >
          <p
            class="font-body text-[0.72rem] font-bold uppercase tracking-[0.14em] text-secondary"
          >
            {m.community_spaces_discussions_eyebrow()}
          </p>
        </div>
        <h3
          class="community-space-card-title font-display text-[clamp(2rem,3vw,3rem)] font-bold leading-none text-primary"
        >
          {m.community_spaces_discussions_title()}
        </h3>
        <p
          class="community-space-card-description max-w-136 font-body text-[0.98rem] leading-[1.75] text-foreground-alt"
        >
          {m.community_spaces_discussions_description()}
        </p>

        <ul
          class="community-space-card-topics space-y-3"
          aria-label={m.community_spaces_discussions_title()}
        >
          {#each discussionUses as use}
            <li
              class="flex items-start gap-3 font-body text-[0.92rem] leading-[1.55] text-foreground"
            >
              <Icon
                icon="proicons:checkmark-circle"
                class="mt-0.5 size-5 shrink-0 text-secondary"
                aria-hidden="true"
              />
              {use()}
            </li>
          {/each}
        </ul>

        <div class="community-space-card-footer">
          <a
            class="community-space-card-cta inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 font-body text-[0.93rem] font-bold text-secondary transition-shadow hover:shadow-[0_0_1.5rem_rgb(255_255_255/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
            href="https://github.com/orgs/saanseoi/discussions"
            target="_blank"
            rel="noreferrer"
          >
            <Icon icon="proicons:github" class="size-4" aria-hidden="true" />
            {m.community_spaces_visit_discussions()}
            <Icon icon="proicons:open-new-window" class="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>

    <a
      class="community-space-float-icon community-space-float-icon-discord"
      href="https://discord.gg/thXu6psten"
      target="_blank"
      rel="noreferrer"
      aria-label="Join SaanSeoi on Discord"
      bind:this={discordFloatIcon}
    >
      <Icon icon="simple-icons:discord" aria-hidden="true" />
    </a>
    <a
      class="community-space-float-icon community-space-float-icon-discussions"
      href="https://github.com/orgs/saanseoi/discussions"
      target="_blank"
      rel="noreferrer"
      aria-label="Visit SaanSeoi Discussions on GitHub"
      bind:this={discussionsFloatIcon}
    >
      <Icon icon="proicons:github" aria-hidden="true" />
    </a>
    <nav class="community-space-socials" aria-label="Socials">
      <span class="community-space-socials-label">And find us on</span>
      <a
        class="community-space-float-icon community-space-float-icon-social community-space-float-icon-instagram"
        href="https://www.instagram.com/saanseoi/"
        target="_blank"
        rel="noreferrer"
        aria-label="Follow SaanSeoi on Instagram"
        bind:this={instagramFloatIcon}
      >
        <Icon icon="simple-icons:instagram" aria-hidden="true" />
      </a>
      <a
        class="community-space-float-icon community-space-float-icon-social community-space-float-icon-linkedin"
        href="https://www.linkedin.com/company/saanseoi"
        target="_blank"
        rel="noreferrer"
        aria-label="Follow SaanSeoi on LinkedIn"
        bind:this={linkedInFloatIcon}
      >
        <Icon icon="simple-icons:linkedin" aria-hidden="true" />
      </a>
      <a
        class="community-space-float-icon community-space-float-icon-social community-space-float-icon-threads"
        href="https://www.threads.com/@saanseoi"
        target="_blank"
        rel="noreferrer"
        aria-label="Follow SaanSeoi on Threads"
        bind:this={threadsFloatIcon}
      >
        <Icon icon="simple-icons:threads" aria-hidden="true" />
      </a>
    </nav>
  </div>
</section>

<style>
@media (min-width: 901px) {
  .community-spaces {
    display: flex;
    min-height: 0;
    flex: 1 1 0;
    flex-direction: column;
  }

  .community-spaces-grid {
    display: grid;
    position: relative;
    height: var(--community-shape-size);
    min-height: 0;
    flex: 0 0 var(--community-shape-size);
    grid-template-columns: repeat(2, var(--community-shape-size));
    justify-content: center;
    gap: 0;
    align-items: stretch;
    container-name: community-shapes;
    container-type: size;
    margin-block: auto;
  }

  .community-space-card {
    min-height: 0;
    padding: calc(var(--community-shape-size) * 0.1);
    border: 0;
    background: transparent;
    grid-row: 1;
  }

  .community-space-card-discord {
    grid-column: 1;
  }

  .community-space-card-discussions {
    grid-column: 2;
  }

  .community-space-blob {
    position: relative;
    z-index: 1;
    grid-row: 1;
    width: 105%;
    align-self: center;
    justify-self: center;
    clip-path: var(--community-blob-clip-path);
    opacity: 0.8;
    pointer-events: none;
  }

  .community-space-blob-discord {
    grid-column: 1;
    height: calc((var(--community-shape-size) + 48px) * 1.05);
    background: #5865f2;
    transform: translateY(calc(var(--community-shape-size) * 0.02))
      translate(
        calc(var(--community-shape-size) * -0.036585),
        calc(var(--community-shape-size) * -0.082927)
      );
  }

  .community-space-blob-discord-upper {
    transform: translateY(calc(var(--community-shape-size) * 0.02 - 0.8rem))
      translate(
        calc(var(--community-shape-size) * -0.036585 - 0.8rem),
        calc(var(--community-shape-size) * -0.082927 - 0.8rem)
      );
  }

  .community-space-blob-discord-lower {
    transform: translateY(calc(var(--community-shape-size) * 0.02 + 0.8rem))
      translate(
        calc(var(--community-shape-size) * -0.036585 + 0.8rem),
        calc(var(--community-shape-size) * -0.082927 + 0.8rem)
      );
  }

  .community-space-blob-discussions {
    grid-column: 2;
    height: calc(var(--community-shape-size) * 1.05);
    background: #45d2bb;
    transform: translateY(calc(var(--community-shape-size) * 0.02))
      translate(
        calc(var(--community-shape-size) * 0.085366),
        calc(var(--community-shape-size) * -0.253049)
      )
      scaleX(-1);
  }

  .community-space-blob-discussions-upper {
    transform: translateY(calc(var(--community-shape-size) * 0.02 - 0.8rem))
      translate(
        calc(var(--community-shape-size) * 0.085366 - 0.8rem),
        calc(var(--community-shape-size) * -0.253049 - 0.8rem)
      )
      scaleX(-1);
  }

  .community-space-blob-discussions-lower {
    transform: translateY(calc(var(--community-shape-size) * 0.02 + 0.8rem))
      translate(
        calc(var(--community-shape-size) * 0.085366 + 0.8rem),
        calc(var(--community-shape-size) * -0.253049 + 0.8rem)
      )
      scaleX(-1);
  }

  .community-space-card::before,
  .community-space-card::after {
    position: absolute;
    inset: 0;
    clip-path: inherit;
    pointer-events: none;
    content: "";
  }

  .community-space-card::before {
    z-index: 0;
  }

  .community-space-card::after {
    inset: 0.25rem;
    z-index: 0;
    background: var(--surface-container-lowest);
  }

  .community-space-card-title {
    margin-top: max(1rem, calc(var(--community-shape-size) * 0.022));
    font-size: clamp(2rem, calc(var(--community-shape-size) * 0.07), 2.9rem);
  }

  .community-space-card-content {
    position: relative;
    width: min(100%, calc(var(--community-shape-size) * 0.54));
    height: 100%;
    margin-inline: auto;
    padding-bottom: 0;
    justify-content: center;
    z-index: 1;
  }

  .community-space-card-identity {
    justify-content: center;
    text-align: center;
  }

  .community-space-card-description {
    margin-top: max(1rem, calc(var(--community-shape-size) * 0.013));
  }

  .community-space-card-topics {
    margin-top: max(1rem, calc(var(--community-shape-size) * 0.022));
  }

  .community-space-card-footer {
    display: flex;
    flex-shrink: 0;
    margin-top: 1rem;
    align-items: end;
    justify-content: flex-start;
    gap: 1rem;
  }

  .community-space-card-cta {
    min-height: 3.4375rem;
    gap: 0.625rem;
    padding: 0.9375rem 1.5625rem;
    font-size: 1.1625rem;
  }

  .community-space-float-icon :global(svg) {
    width: 48%;
    height: 48%;
  }

  /* The first blob has a deeper inward curve along its left edge. Nudge the
   * readable column towards its generous right-hand shoulder so its title and
   * topics live inside the coloured shape, not against the clipped edge. */
  .community-space-card-discord .community-space-card-content {
    transform: translateX(2.5rem);
  }

  .community-space-card-discord,
  .community-space-card-discussions {
    background: transparent;
  }

  .community-space-card-discord {
    box-shadow: 0 1.25rem 2.8rem rgb(88 101 242 / 0.14);
    color: var(--foreground);
  }

  .community-space-card-discord::before {
    background: #5865f2;
  }

  .community-space-card-discord-ring,
  .community-space-card-discussions-ring {
    border-color: rgb(88 101 242 / 0.18);
  }

  .community-space-card-discussions-ring {
    border-color: rgb(15 157 133 / 0.18);
  }

  .community-space-card-discord-shade,
  .community-space-card-discussions-shade {
    opacity: 0.2;
  }

  .community-space-card-discord .community-space-card-identity p {
    color: #5865f2;
  }

  .community-space-card-discord .community-space-card-title {
    margin-top: max(1rem, calc(var(--community-shape-size) * 0.022));
    color: var(--foreground);
    text-align: start;
    transform: translateX(0);
  }

  :global(.dark) .community-space-card-discord .community-space-card-title {
    color: white;
  }

  .community-space-card-discord .community-space-card-description {
    color: var(--foreground-alt);
  }

  .community-space-card-discord .community-space-topic {
    border-color: rgb(88 101 242 / 0.3);
    background: color-mix(in srgb, #5865f2 12%, var(--surface-container-lowest));
  }

  .community-space-card-discord .community-space-topic > span:first-child {
    background: rgb(88 101 242 / 0.18);
    color: #5865f2;
  }

  .community-space-card-discord .community-space-topic > span:last-child {
    color: var(--foreground);
  }

  .community-space-card-discord .community-space-card-cta {
    background: #5865f2;
    color: white;
  }

  .community-space-card-discord .community-space-card-identity {
    transform: translateX(-3.75rem);
  }

  .community-space-card-discord .community-space-card-description {
    width: calc(100% + 1.5rem);
    max-width: none;
    text-align: start;
    transform: translateX(-1.5rem);
  }

  .community-space-card-discord .community-space-card-topics {
    width: calc(100% + 2rem);
    transform: translateX(-2rem);
  }

  .community-space-card-discord .community-space-topic > span:last-child {
    white-space: nowrap;
  }

  .community-space-card-discussions {
    width: var(--community-discussions-size);
    height: var(--community-discussions-size);
    justify-self: center;
    border-color: #45d2bb;
    box-shadow: 0 1.25rem 2.8rem rgb(10 111 95 / 0.22);
    color: var(--foreground);
  }

  .community-space-card-discussions::before {
    background: #45d2bb;
  }

  .community-space-card-discussions-shade {
    z-index: 0;
  }

  .community-space-card-discussions .community-space-card-content {
    position: relative;
    z-index: 1;
  }

  .community-space-card-discussions .community-space-card-content {
    transform: translateX(-2rem) scaleX(-1);
  }

  .community-space-card-discussions .community-space-card-identity {
    transform: translateX(-0.75rem);
  }

  .community-space-card-discussions .community-space-card-footer {
    transform: none;
  }

  .community-space-card-discussions .community-space-card-cta {
    background: #0f9d85;
    color: white;
    transform: translateX(4rem);
  }

  .community-space-card-discussions .community-space-card-identity p {
    color: #0f9d85;
  }

  .community-space-card-discussions .community-space-card-title,
  .community-space-card-discussions .community-space-card-description,
  .community-space-card-discussions .community-space-card-topics li {
    color: var(--foreground);
  }

  .community-space-card-discussions .community-space-card-description {
    color: var(--foreground-alt);
  }

  .community-space-card-discussions .community-space-card-topics :global(svg) {
    color: #0f9d85;
  }

  .community-space-card-discord .community-space-card-footer {
    margin-top: 2rem;
    justify-content: center;
  }

  .community-space-card-discord .community-space-card-cta {
    transform: translateX(-3rem);
  }

  .community-space-float-icon {
    position: absolute;
    z-index: 5;
    display: grid;
    width: clamp(4.75rem, calc(var(--community-shape-size) * 0.16), 13.2rem);
    aspect-ratio: 1;
    place-items: center;
    border: 1px solid color-mix(in srgb, currentColor 32%, transparent);
    border-radius: 999px;
    backdrop-filter: blur(0.5rem);
    box-shadow: 0 1rem 2.25rem rgb(0 0 0 / 0.16);
    cursor: pointer;
    text-decoration: none;
    transition: box-shadow 280ms ease;
  }

  .community-space-float-icon:focus-visible {
    outline: 3px solid white;
    outline-offset: 0.3rem;
  }

  .community-space-float-icon-discord {
    top: var(
      --community-discord-anchor-top,
      calc(var(--community-shape-size) * 0.028805 + 4% + 2rem)
    );
    left: var(
      --community-discord-anchor-left,
      calc(35.5% - var(--community-shape-size) * 0.07622 - 2rem)
    );
    background: #5865f2;
    color: white;
  }

  .community-space-float-icon-discussions {
    top: var(
      --community-discussions-anchor-top,
      calc(var(--community-shape-size) * -0.146341 - 5px + 12%)
    );
    left: var(--community-discussions-anchor-left, calc(50% + 1% + 35px + 2rem));
    background: #0f9d85;
    color: white;
  }

  .community-space-float-icon-social {
    z-index: 4;
    width: clamp(5.9375rem, calc(var(--community-shape-size) * 0.2), 16.5rem);
    border-radius: 0;
  }

  .community-space-float-icon-instagram {
    top: 14%;
    left: 45%;
    width: clamp(6.234375rem, calc(var(--community-shape-size) * 0.21), 17.325rem);
    background: #d62976;
    color: white;
    clip-path: shape(
      from 58.43% 81.90%,
      curve to 19.84% 67.35% with 35.13% 87.55%,
      smooth to 21.36% 25.53%,
      smooth to 59.66% 17.08%,
      smooth to 81.43% 53.24%,
      smooth to 58.43% 81.90%
    );
  }

  .community-space-float-icon-instagram :global(svg) {
    width: 45.714286%;
    height: 45.714286%;
    transform: translate(-9%, -7%);
  }

  .community-space-float-icon-linkedin {
    top: 63%;
    left: calc(49% + 12px);
    background: #0a66c2;
    color: white;
    clip-path: shape(
      from 85.10% 68.78%,
      curve to 66.68% 87.31% with 77.65% 79.44%,
      smooth to 41.40% 93.43%,
      smooth to 21.86% 78.69%,
      smooth to 13.09% 53.99%,
      smooth to 14.28% 29.64%,
      smooth to 31.41% 9.07%,
      smooth to 55.75% 9.50%,
      smooth to 81.23% 23.38%,
      smooth to 93.68% 43.52%,
      smooth to 85.10% 68.78%
    );
  }

  .community-space-float-icon-threads {
    top: 38.5%;
    left: calc(45% + 32px);
    background: #1d1d1d;
    color: white;
    clip-path: shape(
      from 87.98% 42.63%,
      curve to 91.23% 58.71% with 90.39% 50.00%,
      smooth to 87.85% 75.53%,
      smooth to 73.87% 83.85%,
      smooth to 57.06% 87.62%,
      smooth to 41.33% 91.50%,
      smooth to 23.93% 88.33%,
      smooth to 15.64% 74.43%,
      smooth to 8.30% 57.02%,
      smooth to 5.23% 41.71%,
      smooth to 17.57% 29.29%,
      smooth to 30.31% 20.03%,
      smooth to 42.73% 12.51%,
      smooth to 58.40% 9.79%,
      smooth to 73.97% 14.15%,
      smooth to 83.35% 27.07%,
      smooth to 87.98% 42.63%
    );
  }

  .community-space-card-discord:hover ~ .community-space-float-icon-discord,
  .community-space-card-discussions:hover ~ .community-space-float-icon-discussions {
    box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 0.22);
  }

  .community-space-socials {
    display: contents;
  }

  .community-space-socials-label {
    display: none;
  }

  /* Above FHD, preserve the card's FHD proportions as the blobs grow. */
  @media (min-width: 120rem) {
    .community-space-card-title {
      font-size: max(2.9rem, min(2.416667vw, 4.296296svh));
    }

    .community-spaces .community-space-card-identity p {
      font-size: max(0.72rem, min(0.6vw, 1.066667svh));
    }

    .community-space-card-description {
      font-size: max(0.98rem, min(0.816667vw, 1.451852svh));
    }

    .community-spaces .community-space-card-topics li,
    .community-spaces .community-space-topic {
      font-size: max(0.86rem, min(0.716667vw, 1.274074svh));
    }

    .community-spaces .community-space-topic {
      gap: max(0.75rem, min(0.625vw, 1.111111svh));
      padding: max(0.75rem, min(0.625vw, 1.111111svh));
    }

    .community-space-topic > span {
      width: max(1.75rem, min(1.458333vw, 2.592593svh));
      height: max(1.75rem, min(1.458333vw, 2.592593svh));
    }

    .community-space-card-footer,
    .community-space-card-discord .community-space-card-footer {
      margin-top: max(2rem, min(1.666667vw, 2.962963svh));
    }

    .community-space-card-cta {
      min-height: max(3.4375rem, min(2.864583vw, 5.092593svh));
      gap: max(0.625rem, min(0.520833vw, 0.925926svh));
      padding: max(0.9375rem, min(0.78125vw, 1.388889svh))
        max(1.5625rem, min(1.302083vw, 2.314815svh));
      font-size: max(1.1625rem, min(0.96875vw, 1.722222svh));
    }
  }

  /* The usable centre of each irregular shape is smaller than its square
   * bounding box. These thresholds keep the identity and CTA in that centre,
   * then restore supporting material as vertical room becomes available. */
  @container community-shapes (max-height: 36rem) {
    .community-space-card-discord .community-space-card-content,
    .community-space-card-discussions .community-space-card-content {
      align-items: center;
    }

    .community-space-card-discord .community-space-card-content {
      transform: none;
    }

    .community-space-card-discussions .community-space-card-content {
      transform: scaleX(-1);
    }

    .community-space-card-discord .community-space-card-identity,
    .community-space-card-discussions .community-space-card-identity,
    .community-space-card-discord .community-space-card-title,
    .community-space-card-discord .community-space-card-description,
    .community-space-card-discussions .community-space-card-description,
    .community-space-card-discord .community-space-card-topics,
    .community-space-card-discussions .community-space-card-topics,
    .community-space-card-discord .community-space-card-footer,
    .community-space-card-discussions .community-space-card-footer {
      transform: none;
    }

    .community-space-card-discord .community-space-card-description,
    .community-space-card-discussions .community-space-card-description {
      width: 100%;
      max-width: none;
    }

    .community-space-card-discord .community-space-card-title,
    .community-space-card-discussions .community-space-card-title {
      width: 100%;
      text-align: center;
    }

    .community-space-card-discord .community-space-card-footer,
    .community-space-card-discussions .community-space-card-footer {
      justify-content: center;
    }

    .community-space-card-discord .community-space-card-cta,
    .community-space-card-discussions .community-space-card-cta {
      transform: none;
    }

    .community-space-float-icon-discord {
      top: var(
        --community-discord-anchor-top,
        calc(var(--community-shape-size) * 0.028805 + 4% - 2rem)
      );
    }

    .community-space-float-icon-discussions {
      top: var(
        --community-discussions-anchor-top,
        calc(var(--community-shape-size) * -0.146341 - 5px + 12% - 4rem)
      );
    }
  }

  @container community-shapes (max-height: 36rem) {
    .community-space-card-topics {
      display: none;
    }
  }

  @container community-shapes (max-height: 27rem) {
    .community-space-card-discord .community-space-card-content,
    .community-space-card-discussions .community-space-card-content {
      align-items: center;
    }

    .community-space-card-discord .community-space-card-content {
      transform: none;
    }

    .community-space-card-discussions .community-space-card-content {
      transform: scaleX(-1);
    }

    .community-space-card-discord .community-space-card-identity,
    .community-space-card-discussions .community-space-card-identity,
    .community-space-card-discord .community-space-card-title,
    .community-space-card-discord .community-space-card-description,
    .community-space-card-discussions .community-space-card-description,
    .community-space-card-discord .community-space-card-topics,
    .community-space-card-discussions .community-space-card-topics,
    .community-space-card-discord .community-space-card-footer,
    .community-space-card-discussions .community-space-card-footer {
      transform: none;
    }

    .community-space-card-discord .community-space-card-description,
    .community-space-card-discussions .community-space-card-description {
      width: 100%;
      max-width: none;
    }

    .community-space-card-discord .community-space-card-title {
      width: 100%;
    }

    .community-space-card-discord .community-space-card-footer,
    .community-space-card-discussions .community-space-card-footer {
      justify-content: center;
    }

    .community-space-card-discord .community-space-card-cta,
    .community-space-card-discussions .community-space-card-cta {
      transform: none;
    }

    /* Keep the service badges attached to the blob as its compact layout
     * centres the remaining title and action. */
    .community-space-float-icon-discord {
      top: var(
        --community-discord-anchor-top,
        calc(var(--community-shape-size) * 0.028805 + 4% - 2rem)
      );
    }

    .community-space-float-icon-discussions {
      top: var(
        --community-discussions-anchor-top,
        calc(var(--community-shape-size) * -0.146341 - 5px + 12% - 4rem)
      );
    }

    .community-space-card-topics {
      display: none;
    }
  }

  @container community-shapes (max-height: 23rem) {
    .community-space-card-description {
      display: none;
    }
  }

  @container community-shapes (max-height: 29rem) {
    .community-space-card-identity {
      display: none;
    }
  }

  @container community-shapes (max-height: 19rem) {
    .community-space-float-icon {
      display: none;
    }

    .community-space-card-title {
      display: none;
    }

    .community-space-card-content {
      align-items: center;
      justify-content: center;
    }

    .community-space-card-discord .community-space-card-footer,
    .community-space-card-discussions .community-space-card-footer {
      position: absolute;
      top: 50%;
      left: 50%;
      width: max-content;
      margin: 0;
      padding: 0;
      transform: translate(-50%, -50%);
    }

    .community-space-card-cta {
      transform: none;
    }
  }

  @container community-shapes (max-height: 14rem) {
    .community-space-card-footer {
      display: none;
    }
  }
}

@media (min-width: 901px) and (max-height: 650px) {
  .community-space-card-topics,
  .community-space-card-description,
  .community-space-card-identity {
    display: none;
  }

  .community-space-card-content {
    align-items: center;
    justify-content: center;
  }

  .community-space-float-icon-discord {
    left: var(--community-discord-anchor-left, calc(50% - 3rem));
  }
}

@media (min-width: 901px) and (max-width: 1085px) {
  .community-space-card-description {
    display: none;
  }

  .community-space-card-footer,
  .community-space-card-discord .community-space-card-footer,
  .community-space-card-discussions .community-space-card-footer {
    margin-top: 2rem;
  }
}

@media (min-width: 901px) and (max-width: 1358px) {
  .community-space-card-discord .community-space-card-description {
    width: calc(100% + 2rem);
  }
}

@media (max-width: 900px) {
  .community-space-blob {
    display: none;
  }

  .community-space-card-discord,
  .community-space-card-discussions {
    background: var(--surface-container-lowest);
  }

  .community-space-card-discord {
    border-color: #5865f2;
    box-shadow: 0 1.25rem 2.8rem rgb(88 101 242 / 0.14);
    color: var(--foreground);
  }

  .community-space-card-discord-ring {
    border-color: rgb(88 101 242 / 0.18);
  }

  .community-space-card-discord-shade,
  .community-space-card-discussions-shade {
    opacity: 0.2;
  }

  .community-space-card-discord .community-space-card-identity p {
    color: #5865f2;
  }

  .community-space-card-discord .community-space-card-title {
    color: color-mix(in srgb, #5865f2 72%, var(--foreground));
  }

  .community-space-card-discord .community-space-card-description {
    color: var(--foreground-alt);
  }

  .community-space-card-discord .community-space-topic {
    border-color: rgb(88 101 242 / 0.3);
    background: color-mix(in srgb, #5865f2 12%, var(--surface-container-lowest));
  }

  .community-space-card-discord .community-space-topic > span:first-child {
    background: rgb(88 101 242 / 0.18);
    color: #5865f2;
  }

  .community-space-card-discord .community-space-topic > span:last-child {
    color: var(--foreground);
  }

  .community-space-card-discord .community-space-card-cta {
    background: #5865f2;
    color: white;
  }

  .community-spaces-grid {
    margin-bottom: 0;
  }

  .community-space-card-title {
    margin-top: 0.25rem;
  }

  .community-space-card-description {
    margin-top: 0.5rem;
  }

  .community-space-card-topics {
    margin-top: 0.5rem;
  }

  .community-space-card-footer {
    display: flex;
    margin-top: 0.875rem;
    align-items: end;
    justify-content: flex-end;
    gap: 1rem;
  }

  .community-space-card-discussions {
    border-color: #45d2bb;
    box-shadow: 0 1.25rem 2.8rem rgb(10 111 95 / 0.14);
    color: var(--foreground);
  }

  .community-space-card-discussions-shade {
    z-index: 1;
  }

  .community-space-card-discussions .community-space-card-content {
    position: relative;
    z-index: 2;
  }

  .community-space-card-discussions .community-space-card-identity p {
    color: #0f9d85;
  }

  .community-space-card-discussions .community-space-card-title,
  .community-space-card-discussions .community-space-card-description,
  .community-space-card-discussions .community-space-card-topics li {
    color: var(--foreground);
  }

  .community-space-card-discussions .community-space-card-description {
    color: var(--foreground-alt);
  }

  .community-space-card-discussions .community-space-card-topics :global(svg) {
    color: #0f9d85;
  }

  .community-space-card-discussions .community-space-card-cta {
    background: #0f9d85;
    color: white;
  }

  .community-space-float-icon-discord,
  .community-space-float-icon-discussions {
    display: none;
  }

  .community-space-socials {
    display: grid;
    grid-template-columns: repeat(3, 3rem);
    margin-block: 0.75rem;
    align-items: center;
    justify-content: center;
    column-gap: 1rem;
    row-gap: 0.5rem;
  }

  .community-space-socials-label {
    display: block;
    grid-column: 1 / -1;
    color: var(--foreground-alt);
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-variant-caps: all-small-caps;
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    text-align: center;
  }

  .community-space-float-icon-social {
    display: grid;
    width: 3rem;
    aspect-ratio: 1;
    place-items: center;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: currentColor;
    text-decoration: none;
    transform: none;
  }

  .community-space-float-icon-social :global(svg) {
    width: 2.25rem;
    height: 2.25rem;
  }

  .community-space-float-icon-instagram :global(svg) {
    transform: translate(-9%, -7%);
  }
}

@media (min-width: 768px) and (max-width: 900px) {
  .community-space-card-discussions .community-space-card-description {
    max-width: none;
  }
}
</style>
