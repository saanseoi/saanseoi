<script lang="ts">
type Props = {
  current: number
  label: string
  total: number
}

let { current, label, total }: Props = $props()
</script>

{label}
[{current}/{total}]
