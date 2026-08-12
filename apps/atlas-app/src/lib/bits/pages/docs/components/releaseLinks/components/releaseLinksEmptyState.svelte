<script lang="ts">
type Props = { label: string }

let { label }: Props = $props()
</script>

<p class="px-5 pt-3 font-body text-body-md text-foreground-alt">{label}</p>
