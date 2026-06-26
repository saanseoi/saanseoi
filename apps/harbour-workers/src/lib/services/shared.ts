export type DataShardEnvironment = 'preview' | 'production'

export function resolveDataShardEnvironment(
  configuredEnvironment: string | undefined,
): DataShardEnvironment {
  return configuredEnvironment === 'production' ? 'production' : 'preview'
}
