<script lang="ts">
type Props = {
  code: string
  label: string
}

let { code, label }: Props = $props()
</script>

<div class="overflow-hidden border border-border-card bg-[#171918] shadow-card">
  <p
    class="border-b border-white/15 bg-white/5 px-4 py-2 font-body text-xs font-semibold tracking-[0.08em] text-white/70 uppercase"
  >
    {label}
  </p>
  <pre class="overflow-x-auto p-4 font-mono text-sm leading-6 text-[#e5e2de]"><code
    >{code}</code
  ></pre>
</div>
