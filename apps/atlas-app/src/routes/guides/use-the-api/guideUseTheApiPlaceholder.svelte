<script lang="ts">
import { Button } from '#lib/bits/primitives/button/index.js'
import { m } from '#lib/bits/internal/i18n.js'
</script>

<section class="max-w-4xl">
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {m.guide_use_api_eyebrow()}
  </p>
  <h1
    class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
  >
    {m.guide_use_api_hero()}
  </h1>
  <p class="mt-6 max-w-2xl font-body text-body-lg leading-8 text-foreground-alt">
    {m.guide_use_api_placeholder_description()}
  </p>
  <div class="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
    <Button href="/guides/api-keys" variant="primary" class="justify-between">
      {m.guide_use_api_keys_action()}
      <span aria-hidden="true">→</span>
    </Button>
    <Button href="/docs" variant="secondary" class="justify-between">
      {m.guide_use_api_docs_action()}
      <span aria-hidden="true">→</span>
    </Button>
  </div>
</section>
