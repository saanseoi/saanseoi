import type { prepareUpload } from '@repo/core/uploadLocal'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

export type PreparedUploadFile = {
  cleanup(): Promise<void>
  filePath: string
  transformed: boolean
}

export async function prepareUploadFileForDispatch(
  filePath: string,
  _previewResult: UploadPreviewResult,
): Promise<PreparedUploadFile> {
  return {
    cleanup: async () => undefined,
    filePath,
    transformed: false,
  }
}
