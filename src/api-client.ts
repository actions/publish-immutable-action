import * as core from '@actions/core'
import * as github from '@actions/github'

export async function getRepositoryMetadata(
  repository: string,
  token: string
): Promise<{ repoId: string; ownerId: string }> {
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${repository}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch repository metadata due to bad status code: ${response.status}`
    )
  }

  const data = await response.json()

  // Check that the response contains the expected data
  if (!data.id || !data.owner.id) {
    throw new Error(
      `Failed to fetch repository metadata: unexpected response format`
    )
  }

  return { repoId: String(data.id), ownerId: String(data.owner.id) }
}

export async function getContainerRegistryURL(): Promise<URL> {
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/packages/container-registry-url`
  )
  if (!response.ok) {
    throw new Error(
      `Failed to fetch container registry url due to bad status code: ${response.status}`
    )
  }
  const data = await response.json()

  if (!data.url) {
    throw new Error(
      `Failed to fetch repository metadata: unexpected response format`
    )
  }

  const registryURL: URL = new URL(data.url)
  return registryURL
}
