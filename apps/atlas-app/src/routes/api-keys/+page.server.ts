import { getApiKeysPageData } from './apiKeys.remote'

export async function load() {
  return { apiKeys: await getApiKeysPageData() }
}
