<script lang="ts">
import { auditStatus } from './auditStatus'
let { status }: { status: string } = $props()
</script>

<span
  class={['rounded-full px-2 py-1 text-xs', status === 'applied' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500']}
  title={auditStatus(status)}
  >{auditStatus(status)}</span
>
