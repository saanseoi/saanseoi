import { getAccountPageData } from './account.remote'

export async function load() {
  return { accountPageData: await getAccountPageData() }
}
