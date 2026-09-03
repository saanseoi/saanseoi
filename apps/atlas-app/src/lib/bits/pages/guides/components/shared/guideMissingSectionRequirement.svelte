<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  action: string
  href: string
  requirement: string
}

let { action, href, requirement }: Props = $props()
</script>

<aside
  class="mt-8 max-w-232 border-l-4 border-[#b42318] bg-[#fff4f2] p-6 dark:border-[#ef8b88] dark:bg-[#ef8b88]/12"
  aria-live="polite"
>
  <div class="flex items-start gap-3">
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-0.5 size-5 shrink-0 text-[#b42318] dark:text-[#ef8b88]"
      aria-hidden="true"
    />
    <div class="min-w-0">
      <p class="font-body text-body-lg leading-8 text-foreground-alt">
        <strong class="text-primary"
          >{m.guide_section_missing_requirement({ requirement, action })}</strong
        >
      </p>
      <a
        class="mt-3 inline-flex font-body text-label-md font-semibold text-secondary underline underline-offset-4"
        {href}
      >
        {m.guide_section_missing_requirement_link({ requirement })}
      </a>
    </div>
  </div>
</aside>
