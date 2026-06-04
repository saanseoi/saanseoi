export type AppEnv = {
  Bindings: {
    DB: D1Database
    R2_ACCOUNT_ID: string
    R2_RAW: R2Bucket
    R2_RAW_ACCESS_KEY_ID: string
    R2_RAW_BUCKET_NAME: string
    R2_RAW_SECRET_ACCESS_KEY: string
  }
}
