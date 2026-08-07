<script lang="ts">
type Props = {
  active: boolean
  versionLabel: string
  version: string
  releaseLabel: string
  release: string
}

let { active, versionLabel, version, releaseLabel, release }: Props = $props()
</script>

<span
  class={`block max-h-0 overflow-hidden opacity-0 pointer-events-none transition-[max-height,margin-top,opacity] ${active ? 'mt-4 max-h-32 pointer-events-auto delay-200 duration-200 opacity-100 min-[901px]:absolute min-[901px]:top-9 min-[901px]:right-0 min-[901px]:mt-0 min-[901px]:w-1/4' : ''}`}
>
  <dl class="grid gap-1.5 font-body text-caption">
    <div class="grid min-w-0 gap-0.5">
      <dt class="whitespace-nowrap font-semibold uppercase opacity-78">
        {versionLabel}
      </dt>
      <dd
        class="whitespace-nowrap font-mono text-[0.76rem] leading-none font-extrabold"
      >
        v{version}
      </dd>
    </div>
    <div class="grid min-w-0 gap-0.5">
      <dt class="whitespace-nowrap font-semibold uppercase opacity-78">
        {releaseLabel}
      </dt>
      <dd class="truncate font-mono text-[0.76rem] leading-none font-extrabold">
        {release}
      </dd>
    </div>
  </dl>
</span>
