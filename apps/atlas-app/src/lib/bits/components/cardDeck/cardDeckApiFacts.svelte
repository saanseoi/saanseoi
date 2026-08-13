<script lang="ts">
type Props = {
  active: boolean
  isLoading?: boolean
  versionLabel: string
  version: string
  releaseLabel: string
  release: string
}

let {
  active,
  isLoading = false,
  versionLabel,
  version,
  releaseLabel,
  release,
}: Props = $props()
</script>

<span
  class={`block max-h-0 overflow-hidden opacity-0 pointer-events-none transition-[max-height,margin-top,opacity] ${active ? 'mt-4 max-h-32 pointer-events-auto delay-200 duration-200 opacity-100 min-[901px]:absolute min-[901px]:top-9 min-[901px]:right-0 min-[901px]:mt-0 min-[901px]:w-1/4' : ''}`}
  aria-busy={isLoading}
>
  <dl class="grid gap-1.5 font-body text-caption">
    <div class="grid min-w-0 gap-0.5">
      <dt class="whitespace-nowrap font-semibold uppercase opacity-78">
        {versionLabel}
      </dt>
      <dd
        class="relative whitespace-nowrap font-mono text-[0.76rem] leading-none font-extrabold"
      >
        <span
          class={`transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          >v{version}</span
        >
        <span
          class={`absolute top-0 left-0 h-3 w-10 rounded-full bg-[color-mix(in_srgb,var(--api-card-foreground)_54%,transparent)] transition-[filter,opacity] duration-300 ${isLoading ? 'motion-safe:animate-pulse opacity-100 blur-[2px]' : 'pointer-events-none opacity-0'}`}
          aria-hidden="true"
        ></span>
      </dd>
    </div>
    <div class="grid min-w-0 gap-0.5">
      <dt class="whitespace-nowrap font-semibold uppercase opacity-78">
        {releaseLabel}
      </dt>
      <dd
        class="relative truncate font-mono text-[0.76rem] leading-none font-extrabold"
      >
        <span
          class={`transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          >{release}</span
        >
        <span
          class={`absolute top-0 left-0 h-3 w-full rounded-full bg-[color-mix(in_srgb,var(--api-card-foreground)_54%,transparent)] transition-[filter,opacity] duration-300 ${isLoading ? 'motion-safe:animate-pulse opacity-100 blur-[2px]' : 'pointer-events-none opacity-0'}`}
          aria-hidden="true"
        ></span>
      </dd>
    </div>
  </dl>
</span>
