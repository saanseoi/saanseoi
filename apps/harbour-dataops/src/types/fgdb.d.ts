declare module 'fgdb' {
  type Feature = {
    geometry?: { type?: unknown }
    properties?: Record<string, unknown>
  }

  type FeatureCollection = {
    features: Feature[]
    type: 'FeatureCollection'
  }

  export default function fgdb(
    input: ArrayBuffer | Uint8Array,
  ): Promise<Record<string, FeatureCollection>>
}
