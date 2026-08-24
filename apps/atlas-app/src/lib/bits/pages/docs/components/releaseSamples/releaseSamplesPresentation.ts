export type ReleaseSampleField = {
  key: string
  value?: string
  children?: ReleaseSampleField[]
}

export type AddressSample = {
  id: string
  fields: ReleaseSampleField[]
}

export type GroupedSampleField = {
  key: string
  values: Array<{ sampleIds: string[]; value: string }>
  children: GroupedSampleField[]
}

export const sampleValueTones = [
  {
    border: 'border-teal-400',
    surface: 'bg-teal-500/40',
    marker: 'bg-teal-400',
  },
  {
    border: 'border-cyan-400',
    surface: 'bg-cyan-500/40',
    marker: 'bg-cyan-400',
  },
  {
    border: 'border-sky-400',
    surface: 'bg-sky-500/40',
    marker: 'bg-sky-400',
  },
  {
    border: 'border-blue-400',
    surface: 'bg-blue-500/40',
    marker: 'bg-blue-400',
  },
  {
    border: 'border-indigo-400',
    surface: 'bg-indigo-500/40',
    marker: 'bg-indigo-400',
  },
  {
    border: 'border-violet-400',
    surface: 'bg-violet-500/40',
    marker: 'bg-violet-400',
  },
  {
    border: 'border-fuchsia-400',
    surface: 'bg-fuchsia-500/40',
    marker: 'bg-fuchsia-400',
  },
  {
    border: 'border-rose-400',
    surface: 'bg-rose-500/40',
    marker: 'bg-rose-400',
  },
  {
    border: 'border-orange-400',
    surface: 'bg-orange-500/40',
    marker: 'bg-orange-400',
  },
  {
    border: 'border-lime-400',
    surface: 'bg-lime-500/40',
    marker: 'bg-lime-400',
  },
] as const

const sampleApiTargets = {
  'api-addresses-v0.1': { path: '/addresses/v0' },
  'api-divisions-v0.1': { path: '/divisions/v0' },
} as const

export function supportsReleaseSamples(apiVersion: string) {
  return apiVersion in sampleApiTargets
}

export function getSampleApiPath(apiVersion: string) {
  return sampleApiTargets[apiVersion as keyof typeof sampleApiTargets]?.path ?? null
}

function toSampleFields(source: unknown): ReleaseSampleField[] {
  if (!source || typeof source !== 'object') return []

  const fields: ReleaseSampleField[] = []
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value === null || value === undefined) continue

    if (Array.isArray(value)) {
      const children: ReleaseSampleField[] = []
      for (const [index, item] of value.entries()) {
        if (item === null || item === undefined) continue
        if (typeof item === 'object') {
          const childFields = toSampleFields(item)
          if (childFields.length)
            children.push({ key: `[${index}]`, children: childFields })
          continue
        }
        children.push({ key: `[${index}]`, value: String(item) })
      }
      if (children.length) fields.push({ key, children })
      continue
    }

    if (typeof value === 'object') {
      const children = toSampleFields(value)
      if (children.length) fields.push({ key, children })
      continue
    }

    fields.push({ key, value: String(value) })
  }
  return fields
}

export function toCompleteSample(value: unknown): AddressSample | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const resource = value as Record<string, unknown>
  const id = resource.id
  if (typeof id !== 'string' || !id.trim()) return null

  const fields = toSampleFields(
    Object.fromEntries(Object.entries(resource).filter(([key]) => key !== 'id')),
  )
  return fields.length ? { id, fields } : null
}

export const toCompleteAddressSample = toCompleteSample

function sampleSignature(sample: AddressSample) {
  return JSON.stringify(sample.fields.filter(field => field.key !== 'links'))
}

export function getUniqueAddressSamples(
  values: unknown[],
  existing: AddressSample[] = [],
) {
  const known = new Set(existing.map(sampleSignature))

  return values.flatMap(value => {
    const sample = toCompleteSample(value)
    if (!sample) return []

    const signature = sampleSignature(sample)
    if (known.has(signature)) return []
    known.add(signature)
    return [sample]
  })
}

export function groupAddressSamples(samples: AddressSample[]) {
  const fields: GroupedSampleField[] = [
    {
      key: 'id',
      values: samples.map(sample => ({ sampleIds: [sample.id], value: sample.id })),
      children: [],
    },
  ]

  const merge = (
    source: ReleaseSampleField[],
    sampleId: string,
    target: GroupedSampleField[],
  ) => {
    for (const field of source) {
      let grouped = target.find(candidate => candidate.key === field.key)
      if (!grouped) {
        grouped = { key: field.key, values: [], children: [] }
        target.push(grouped)
      }
      if (field.value !== undefined) {
        const existingValue = grouped.values.find(
          candidate => candidate.value === field.value,
        )
        if (existingValue) existingValue.sampleIds.push(sampleId)
        else grouped.values.push({ sampleIds: [sampleId], value: field.value })
      }
      if (field.children) merge(field.children, sampleId, grouped.children)
    }
  }

  for (const sample of samples) merge(sample.fields, sample.id, fields)
  return fields
}
