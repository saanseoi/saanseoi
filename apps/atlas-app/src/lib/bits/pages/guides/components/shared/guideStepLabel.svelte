<script lang="ts">
type Props = {
  label: string
  number: number
}

let { label, number }: Props = $props()
</script>

{String(number).padStart(2, '0')}
/ {@html label}
