<script lang="ts">
type Props = {
  class?: string
  published: string
}

let { class: className = '', published }: Props = $props()
</script>

<dl class={`space-y-[5px] font-body leading-5 ${className}`}>
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-secondary">Author</dt>
    <dd class="text-right text-foreground-alt">
      <a
        class="underline decoration-secondary/40 underline-offset-3 transition-colors hover:text-secondary"
        href="https://type.hk"
        target="_blank"
        rel="noreferrer"
        >Mart van de Ven</a
      >
    </dd>
  </div>
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-secondary">Published</dt>
    <dd class="text-right text-foreground-alt">{published}</dd>
  </div>
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-secondary">Last revised</dt>
    <dd class="text-right text-foreground-alt">-</dd>
  </div>
  <div class="flex items-baseline justify-between gap-4">
    <dt class="text-secondary">Version</dt>
    <dd class="text-right text-foreground-alt">v1</dd>
  </div>
</dl>
