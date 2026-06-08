<script lang="ts">
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { Input } from '$lib/bits/primitives/input'
import { Label } from '$lib/bits/primitives/label'
</script>

<section
  class="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] py-18 md:px-8 md:py-24 xl:px-[var(--spacing-margin-desktop)]"
>
  <div class="mx-auto max-w-[50rem] text-center">
    <h2
      class="font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.05em] text-primary sm:text-[3.4rem]"
    >
      {m.newsletter_title()}
    </h2>
    <p class="mt-4 font-body text-[1rem] leading-[1.8] text-foreground-alt">
      {m.newsletter_description()}
    </p>

    <form class="mx-auto mt-8 flex max-w-[42rem] flex-col gap-3 sm:flex-row">
      <div class="flex-1">
        <Label class="sr-only" for="newsletter-email">
          {m.newsletter_email_label()}
        </Label>
        <Input
          class="w-full"
          id="newsletter-email"
          name="email"
          placeholder={m.newsletter_email_placeholder()}
          type="email"
          value=""
        />
      </div>
      <Button type="submit" variant="primary">
        {m.newsletter_submit()}
      </Button>
    </form>

    <p class="mt-4 font-body text-[0.78rem] leading-[1.5] text-foreground-alt/70">
      {m.newsletter_privacy()}
    </p>
  </div>
</section>
