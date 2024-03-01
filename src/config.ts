import * as iaToolkit from '@immutable-actions/toolkit'
import * as core from '@actions/core'
import * as github from '@actions/github'

// All the environment options required to run the action
export interface PublishActionOptions {
  // The name of the repository in the format owner/repo
  nameWithOwner: string
  // The GitHub token to use for API requests
  token: string
  // The commit SHA to reset back to after the action completes
  sha: string
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
  // The repository ID of the action repository
  repositoryId: string
  // The owner ID of the action repository
  repositoryOwnerId: string
  // The event that triggered the action
  event: string
  // The ref that triggered the action, associated with the event
  ref: string
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

  // Environment Variables
  const ref: string = process.env.GITHUB_REF || ''
  if (ref === '') {
    throw new Error(`Could not find GITHUB_REF.`)
  }

  const workspaceDir: string = process.env.GITHUB_WORKSPACE || ''
  if (workspaceDir === '') {
    throw new Error(`Could not find GITHUB_WORKSPACE.`)
  }

  const nameWithOwner: string = process.env.GITHUB_REPOSITORY || ''
  if (nameWithOwner === '') {
    throw new Error(`Could not find Repository.`)
  }

  const apiBaseUrl: string = process.env.GITHUB_API_URL || ''
  if (apiBaseUrl === '') {
    throw new Error(`Could not find GITHUB_API_URL.`)
  }

  const runnerTempDir: string = process.env.RUNNER_TEMP || ''
  if (runnerTempDir === '') {
    throw new Error(`Could not find RUNNER_TEMP.`)
  }

  const sha: string = process.env.GITHUB_SHA || ''
  if (sha === '') {
    throw new Error(`Could not find GITHUB_SHA.`)
  }

  const githubServerUrl = process.env.GITHUB_SERVER_URL || ''
  if (githubServerUrl === '') {
    throw new Error(`Could not find GITHUB_SERVER_URL.`)
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
  const containerRegistryUrl: URL =
    await iaToolkit.getContainerRegistryURL(apiBaseUrl)

  // TODO: Figure out if there's a better way to do this
  const isEnterprise =
    !githubServerUrl.endsWith('github.com') &&
    !githubServerUrl.endsWith('ghe.com')

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
