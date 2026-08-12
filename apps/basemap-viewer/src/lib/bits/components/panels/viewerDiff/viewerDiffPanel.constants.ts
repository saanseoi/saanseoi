import type { DiffStatus } from '../../../../diff'

export const diffItems: readonly {
  key: DiffStatus
  colour: string
  labelColour: string
}[] = [
  { key: 'added', colour: 'bg-[#16a34a]', labelColour: 'text-[#16a34a]' },
  { key: 'removed', colour: 'bg-[#dc2626]', labelColour: 'text-[#dc2626]' },
]

export const diffMarkerColours: Record<DiffStatus, string> = {
  added: 'bg-[#16a34a]',
  removed: 'bg-[#dc2626]',
}
