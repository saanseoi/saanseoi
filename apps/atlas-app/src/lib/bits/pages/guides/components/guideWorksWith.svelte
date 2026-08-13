<script lang="ts">
import Icon from '@iconify/svelte'

export type GuideWorksWithGroup = {
  items: Array<{
    icon: string
    label: string
  }>
  title: string
}

type Props = {
  class?: string
  groups: GuideWorksWithGroup[]
  title: string
}

let { groups, title, class: className = '' }: Props = $props()

const loopCopies = [0, 1, 2, 3]
</script>

<section class={`guide-works-with ${className}`} aria-label={title}>
  <h3
    class="font-body text-label-sm font-semibold tracking-[0.16em] text-secondary uppercase"
  >
    {title}
  </h3>

  <div class="guide-works-with__groups mt-3">
    {#each groups as group, index}
      <div class="guide-works-with__row">
        <p class="guide-works-with__label">{group.title}</p>
        <div class="guide-works-with__viewport">
          <ul
            class:guide-works-with__track-reverse={index % 2 === 1}
            class="guide-works-with__track"
          >
            {#each loopCopies as copyIndex}
              {#each group.items as item}
                <li
                  class="guide-works-with__item"
                  aria-hidden={copyIndex > 0 || undefined}
                >
                  <Icon class="size-4 shrink-0" icon={item.icon} aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              {/each}
            {/each}
          </ul>
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
.guide-works-with__groups {
  display: grid;
  gap: 0.65rem;
}

.guide-works-with__row {
  align-items: center;
  column-gap: 1rem;
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  min-height: 2.25rem;
}

.guide-works-with__label {
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.2;
  margin: 0;
}

.guide-works-with__viewport {
  mask-image: linear-gradient(
    to right,
    transparent,
    black 1.25rem,
    black calc(100% - 1.25rem),
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    black 1.25rem,
    black calc(100% - 1.25rem),
    transparent
  );
  overflow: hidden;
}

.guide-works-with__track {
  animation: guide-works-with-scroll 42s linear infinite;
  display: flex;
  min-width: max-content;
  width: max-content;
}

.guide-works-with__track-reverse {
  animation-direction: reverse;
  animation-duration: 46s;
}

.guide-works-with:hover .guide-works-with__track {
  animation-play-state: paused;
}

.guide-works-with__item {
  align-items: center;
  background: color-mix(in srgb, var(--color-secondary-container) 45%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border-card) 80%, transparent);
  color: var(--color-foreground-alt);
  display: inline-flex;
  flex: none;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.35rem;
  line-height: 1;
  margin-right: 0.5rem;
  padding: 0.48rem 0.58rem;
  white-space: nowrap;
}

@keyframes guide-works-with-scroll {
  from {
    transform: translateX(1.25rem);
  }

  to {
    transform: translateX(calc(-25% + 1.25rem));
  }
}

@media (max-width: 30rem) {
  .guide-works-with__row {
    column-gap: 0.75rem;
    grid-template-columns: 3.9rem minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide-works-with__track {
    animation: none;
  }
}
</style>
