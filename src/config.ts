import * as apiClient from './api-client'
import * as core from '@actions/core'
import * as github from '@actions/github'

// All the environment options required to run the action
export interface PublishActionOptions {
  // The name of the repository in the format owner/repo
  nameWithOwner: string
  // The GitHub token to use for API requests
  token: string
  // The base URL for the GitHub API
  apiBaseUrl: string
  // The base URL for the GitHub Container Registry
  containerRegistryUrl: URL
  // The directory where the action is running, used for git operations
  workspaceDir: string
  // The directory set up to be used for temporary files by the runner
  runnerTempDir: string
  // Whether this action is running in enterprise, determined from the github URL
  isEnterprise: boolean
  // The visibility of the action repository ("public", "internal" or "private")
  repositoryVisibility: string
  // The repository ID of the action repository
  repositoryId: string
  // The owner ID of the action repository
  repositoryOwnerId: string
  // The event that triggered the action
  event: string
  // The ref that triggered the action, associated with the event
  ref: string
  // The commit SHA associated with the ref that triggered the action
  sha: string
}

export async function resolvePublishActionOptions(): Promise<PublishActionOptions> {
  // Action Inputs
  const token: string = core.getInput('github-token') || ''
  if (token === '') {
    throw new Error(`Could not find GITHUB_TOKEN.`)
  }

  // Context Inputs
  const event: string = github.context.eventName
  if (event === '') {
    throw new Error(`Could not find event name.`)
  }

  const ref: string = github.context.ref || ''
  if (ref === '') {
    throw new Error(`Could not find GITHUB_REF.`)
  }

  const nameWithOwner: string =
    github.context.payload.repository?.full_name || ''
  if (nameWithOwner === '') {
    throw new Error(`Could not find Repository.`)
  }

  const sha: string = github.context.sha || ''
  if (sha === '') {
    throw new Error(`Could not find GITHUB_SHA.`)
  }

  const apiBaseUrl: string = github.context.apiUrl || ''
  if (apiBaseUrl === '') {
    throw new Error(`Could not find GITHUB_API_URL.`)
  }

  const githubServerUrl = github.context.serverUrl || ''
  if (githubServerUrl === '') {
    throw new Error(`Could not find GITHUB_SERVER_URL.`)
  }

  // Environment Variables
  const workspaceDir: string = process.env.GITHUB_WORKSPACE || ''
  if (workspaceDir === '') {
    throw new Error(`Could not find GITHUB_WORKSPACE.`)
  }

  const runnerTempDir: string = process.env.RUNNER_TEMP || ''
  if (runnerTempDir === '') {
    throw new Error(`Could not find RUNNER_TEMP.`)
  }

  const repositoryId = process.env.GITHUB_REPOSITORY_ID || ''
  if (repositoryId === '') {
    throw new Error(`Could not find GITHUB_REPOSITORY_ID.`)
  }

  const repositoryOwnerId = process.env.GITHUB_REPOSITORY_OWNER_ID || ''
  if (repositoryOwnerId === '') {
    throw new Error(`Could not find GITHUB_REPOSITORY_OWNER_ID.`)
  }

  // Required Values fetched from the GitHub API
  const containerRegistryUrl: URL = await apiClient.getContainerRegistryURL(
    apiBaseUrl,
    token
  )

  const isEnterprise =
    !githubServerUrl.includes('https://github.com') &&
    !githubServerUrl.endsWith('.ghe.com')

  const repoMetadata = await apiClient.getRepositoryMetadata(
    apiBaseUrl,
    nameWithOwner,
    token
  )

  if (repoMetadata.visibility === '') {
    throw new Error(`Could not find repository visibility.`)
  }

  if (repoMetadata.repoId !== repositoryId) {
    throw new Error(`Repository ID mismatch.`)
  }

  if (repoMetadata.ownerId !== repositoryOwnerId) {
    throw new Error(`Repository Owner ID mismatch.`)
  }

  const repositoryVisibility = repoMetadata.visibility

  return {
    event,
    ref,
    workspaceDir,
    nameWithOwner,
    token,
    apiBaseUrl,
    runnerTempDir,
    sha,
    containerRegistryUrl,
    isEnterprise,
    repositoryVisibility,
    repositoryId,
    repositoryOwnerId
  }
}

// When printing this object, we want to hide some of them from being displayed
const internalKeys = new Set<string>([
  'token',
  'runnerTempDir',
  'repositoryId',
  'repositoryOwnerId'
])

export function serializeOptions(options: PublishActionOptions): string {
  return JSON.stringify(
    options,
    (key: string, value: unknown) =>
      internalKeys.has(key) ? undefined : value,
    2 // 2 spaces for pretty-printing
  )
}
