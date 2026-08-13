<script lang="ts">
const lanes = [
  { id: 'skeleton-divisions', inputs: 2 },
  { id: 'skeleton-addresses', inputs: 1 },
  { id: 'skeleton-places', inputs: 3 },
  { id: 'skeleton-streets', inputs: 1 },
  { id: 'skeleton-stats', inputs: 2 },
]
</script>

<div
  class="source-flow-skeleton"
  aria-busy="true"
  aria-live="polite"
  data-source-flow-skeleton
  role="status"
>
  <span class="sr-only">Loading sources</span>
  {#each lanes as lane (lane.id)}
    <div class="source-flow-skeleton-lane">
      <div class="source-flow-skeleton-inputs">
        {#each Array(lane.inputs) as _, inputIndex (`${lane.id}-${inputIndex}`)}
          <div class="source-flow-skeleton-card placeholder" aria-hidden="true">
            <span class="source-flow-skeleton-icon"></span>
            <span class="source-flow-skeleton-copy">
              <span></span>
              <span></span>
            </span>
          </div>
        {/each}
      </div>
      <div class="source-flow-skeleton-gutter placeholder" aria-hidden="true"></div>
      <div class="source-flow-skeleton-output placeholder" aria-hidden="true"></div>
    </div>
  {/each}
</div>

<style>
.source-flow-skeleton {
  display: grid;
  gap: 1rem;
}
.source-flow-skeleton-lane {
  display: grid;
  min-height: 9.5rem;
  grid-template-columns: minmax(0, 1.25fr) minmax(8rem, 0.46fr) minmax(14rem, 0.72fr);
  align-items: start;
  gap: 1.25rem;
  padding: 1rem 0;
}
.source-flow-skeleton-lane:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--outline-variant) 82%, transparent);
}
.source-flow-skeleton-inputs {
  display: grid;
  gap: 0.75rem;
}
.source-flow-skeleton-card,
.source-flow-skeleton-output {
  min-height: 5.65rem;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
}
.source-flow-skeleton-card {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1rem;
}
.source-flow-skeleton-icon {
  width: 4rem;
  height: 4rem;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 68%, transparent);
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--foreground-alt) 10%, transparent);
}
.source-flow-skeleton-copy {
  display: grid;
  gap: 0.65rem;
}
.source-flow-skeleton-copy span {
  display: block;
  height: 0.72rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground-alt) 12%, transparent);
}
.source-flow-skeleton-copy span:last-child {
  width: 58%;
}
.source-flow-skeleton-gutter {
  min-height: 5.65rem;
  margin-top: 9px;
  border-radius: 0.25rem;
}
.source-flow-skeleton-output {
  margin-top: 0.5rem;
}
.placeholder {
  overflow: hidden;
  background: linear-gradient(
    105deg,
    color-mix(in srgb, var(--surface-container-low) 96%, transparent) 0%,
    color-mix(in srgb, var(--surface-container-high) 82%, transparent) 45%,
    color-mix(in srgb, var(--surface-container-low) 96%, transparent) 72%
  );
  background-size: 200% 100%;
  animation: source-flow-skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes source-flow-skeleton-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
@media (max-width: 900px) {
  .source-flow-skeleton-lane {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 1rem 0 1.25rem;
  }
  .source-flow-skeleton-gutter,
  .source-flow-skeleton-output {
    margin-left: 1rem;
  }
  .source-flow-skeleton-gutter {
    min-height: 2.75rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .placeholder {
    animation: none;
  }
}
</style>
