declare module '@mapbox/vector-tile' {
  export type TilePoint = { x: number; y: number }

  export type VectorTileFeature = {
    id?: number
    type: number
    extent: number
    properties: Record<string, unknown>
    loadGeometry(): TilePoint[][]
  }

  export type VectorTileLayer = {
    name: string
    version: number
    extent: number
    length: number
    feature(index: number): VectorTileFeature
  }

  export class VectorTile {
    constructor(pbf: unknown)
    layers: Record<string, VectorTileLayer>
  }
}

declare module 'vt-pbf' {
  type VectorTile = {
    layers: Record<
      string,
      {
        name: string
        version: number
        extent: number
        length: number
        feature(index: number): {
          id?: number
          type: number
          extent: number
          properties: Record<string, unknown>
          loadGeometry(): Array<Array<{ x: number; y: number }>>
        }
      }
    >
  }

  type GeoJsonVtTile = {
    features: Array<{
      type: number
      geometry: number[][]
      tags: Record<string, unknown>
    }>
  }

  const vectorTilePbf: {
    fromVectorTileJs(tile: VectorTile): Uint8Array
    fromGeojsonVt(
      layers: Record<string, GeoJsonVtTile>,
      options?: { extent?: number; version?: number },
    ): Uint8Array
  }

  export = vectorTilePbf
}
