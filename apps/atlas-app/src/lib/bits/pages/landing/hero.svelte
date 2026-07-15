<script lang="ts">
import HeroContent from './components/heroContent.svelte'
import HeroScene from './components/heroScene.svelte'
</script>

<section class="landing-hero relative overflow-hidden">
  <HeroScene />
  <HeroContent />
</section>

<style>
.landing-hero {
  --landing-header-height: 4.5rem;
  min-height: 36.75rem;
  height: max(36.75rem, calc(100svh - var(--landing-header-height)));
}

@media (max-width: 785px) {
  .landing-hero {
    --landing-header-height: 4.5rem;
    min-height: 0;
    height: calc(100svh - var(--landing-header-height));
  }

  .landing-hero :global(.hero-content) {
    align-items: center;
  }
}

@media (min-width: 924px) and (max-width: 1279px) {
  .landing-hero :global(.hero-content-grid) {
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.85fr);
    align-items: center;
    gap: 2rem;
  }

  .landing-hero :global(.hero-content-main) {
    width: min(28rem, 100%);
    justify-self: start;
    margin-inline-start: clamp(3rem, 7vw, 7rem);
    text-align: left;
  }

  .landing-hero :global(.hero-title) {
    font-size: 3.75rem;
  }

  .landing-hero :global(.hero-actions p) {
    margin-inline: 0;
  }

  .landing-hero :global(.hero-cta-group) {
    justify-content: flex-start;
  }
}

@media (min-width: 1024px) {
  .landing-hero {
    min-height: 42.75rem;
    height: max(42.75rem, calc(100svh - var(--landing-header-height)));
  }
}
</style>
