type GitHubDelivery = {
  github_completed_at: number | null
}

export function needsGitHubMirror(delivery: GitHubDelivery | undefined) {
  return !delivery?.github_completed_at
}
