export async function getRepositoryMetadata(
  githubAPIURL: string,
  repository: string,
  token: string
): Promise<{ repoId: string; ownerId: string; visibility: string }> {
  const response = await fetch(`${githubAPIURL}/repos/${repository}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json'
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

  return {
    repoId: String(data.id),
    ownerId: String(data.owner.id),
    visibility: String(data.visibility)
  }
}

export async function getContainerRegistryURL(
  githubAPIURL: string
): Promise<URL> {
  const response = await fetch(
    `${githubAPIURL}/packages/container-registry-url`
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
