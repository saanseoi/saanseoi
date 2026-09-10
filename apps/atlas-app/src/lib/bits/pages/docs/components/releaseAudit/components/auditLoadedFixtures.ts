import type { Json } from '@repo/core/provenance'
import { getContext, setContext } from 'svelte'

const key = Symbol('audit-loaded-fixtures')
export const provideLoadedFixtures = () => setContext(key, new Map<string, Json>())
export const loadedFixtures = () =>
  getContext<Map<string, Json> | undefined>(key) ?? new Map<string, Json>()
