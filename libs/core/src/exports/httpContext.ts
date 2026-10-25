/** Minimal HTTP adapter shared by Atlas and the isolated export Worker. */
export interface ExportHttpContext {
  env: { R2_ASSETS: R2Bucket; ALLOW_EXPORT_MIRRORS?: string }
  req: {
    param(): Record<string, string>
    query(name: string): string | undefined
    header(name: string): string | undefined
    url: string
  }
  json(body: object, status?: 200 | 404 | 410 | 501 | 503): Response
}
