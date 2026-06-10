<script lang="ts">
import { Main } from '$lib/bits'

import PolicyDocument from './components/policy-document.svelte'
import PolicyNotice from './components/policy-notice.svelte'

import type { PolicyDocument as PolicyDocumentType } from './types'

type Props = {
  policy: PolicyDocumentType
}

let { policy }: Props = $props()
</script>

<Main class="policy-shell">
  <section class="policy-hero">
    <div
      class="mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) py-16 md:px-8 md:py-20 xl:px-(--spacing-margin-desktop)"
    >
      <div class="max-w-5xl">
        <div
          class="mb-6 flex items-center gap-3 text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-secondary"
        >
          <span class="h-px w-12 bg-secondary"></span>
          Policy documents
        </div>

        <div class="space-y-5">
          <h1
            class="max-w-4xl font-display text-[2.95rem] leading-[0.94] font-bold tracking-[-0.06em] text-primary sm:text-[4.1rem] lg:text-[4.8rem]"
          >
            {policy.title}
            <span
              class="mt-3 block w-fit rounded-full bg-secondary-container px-5 py-2 text-[1.35rem] leading-none tracking-display-md text-on-secondary-container sm:text-[1.55rem]"
            >
              {policy.chineseTitle}
            </span>
          </h1>
        </div>

        <div class="mt-8 flex flex-wrap gap-3">
          <div class="policy-meta-pill">
            <span class="policy-meta-label">Version</span>
            <span>{policy.version}</span>
          </div>
          <div class="policy-meta-pill">
            <span class="policy-meta-label">Effective date</span>
            <span>{policy.effectiveDate}</span>
          </div>
          {#if policy.standard}
            <div class="policy-meta-pill">
              <span class="policy-meta-label">Standard</span>
              <span>{policy.standard}</span>
            </div>
          {/if}
          <a
            class="policy-meta-pill transition-colors hover:text-secondary"
            href={`mailto:${policy.contactEmail}`}
          >
            <span class="policy-meta-label">Contact</span>
            <span>{policy.contactEmail}</span>
          </a>
        </div>

        <div class="mt-8 max-w-4xl">
          <PolicyNotice />
        </div>
      </div>
    </div>
  </section>

  <section class="relative">
    <div
      class="mx-auto grid max-w-(--spacing-container-max) gap-8 px-(--spacing-margin-mobile) pb-18 md:px-8 lg:gap-10 xl:px-(--spacing-margin-desktop)"
    >
      <PolicyDocument
        badge="English"
        description="Primary version"
        lang="en"
        title={policy.title}
        intro={policy.englishIntro}
        sections={policy.englishSections}
      />

      <PolicyDocument
        badge="繁體中文"
        description="Provided after the English version for convenience"
        lang="zh-Hant"
        title={policy.chineseTitle}
        intro={policy.chineseIntro}
        sections={policy.chineseSections}
      />
    </div>
  </section>
</Main>

<style>
:global(.policy-shell) {
  background:
    radial-gradient(
      circle at top,
      color-mix(in srgb, var(--secondary-container) 36%, transparent),
      transparent 34%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--background) 94%, transparent),
      color-mix(in srgb, var(--surface-container-low) 78%, var(--background))
    );
}

.policy-hero {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background-alt) 92%, transparent),
    color-mix(in srgb, var(--background) 72%, transparent)
  );
}

.policy-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--border-card) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--background-alt) 82%, transparent);
  padding: 0.7rem 1rem;
  box-shadow: var(--shadow-mini);
  color: var(--foreground);
  font-family: var(--font-body, "Plus Jakarta Sans", sans-serif);
  font-size: 0.92rem;
  line-height: 1;
}

.policy-meta-label {
  display: inline-flex;
  align-items: center;
  color: var(--foreground-alt);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.policy-meta-pill span:last-child {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

:global(.dark .policy-shell) {
  background:
    radial-gradient(
      circle at top,
      color-mix(in srgb, var(--secondary) 14%, transparent),
      transparent 34%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--background) 96%, transparent),
      color-mix(in srgb, var(--surface-container-low) 88%, var(--background))
    );
}
</style>
