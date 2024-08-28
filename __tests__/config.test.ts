import * as core from '@actions/core'
import * as github from '@actions/github'
import * as cfg from '../src/config'
import * as apiClient from '../src/api-client'

let getContainerRegistryURLMock: jest.SpyInstance
let getRepositoryMetadataMock: jest.SpyInstance
let getInputMock: jest.SpyInstance

const ghcrUrl = new URL('https://ghcr.io')

describe('config.resolvePublishActionOptions', () => {
  beforeEach(() => {
    getContainerRegistryURLMock = jest
      .spyOn(apiClient, 'getContainerRegistryURL')
      .mockImplementation()

    getRepositoryMetadataMock = jest
      .spyOn(apiClient, 'getRepositoryMetadata')
      .mockImplementation()

    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()

    configureEventContext()
  })

  afterEach(() => {
    jest.clearAllMocks()
    clearEventContext()
  })

  it('throws an error when the token is not provided', async () => {
    getInputMock.mockReturnValueOnce(undefined)

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_TOKEN.'
    )
  })

  it('throws an error when the event is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.eventName = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find event name.'
    )
  })

  it('throws an error when the ref is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.ref = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_REF.'
    )
  })

  it('throws an error when the workspaceDir is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    process.env.GITHUB_WORKSPACE = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_WORKSPACE.'
    )
  })

  it('throws an error when the repository is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.payload.repository = undefined

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find Repository.'
    )
  })

  it('throws an error when the apiBaseUrl is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.apiUrl = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_API_URL.'
    )
  })

  it('throws an error when the runnerTempDir is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    process.env.RUNNER_TEMP = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find RUNNER_TEMP.'
    )
  })

  it('throws an error when the sha is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.sha = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_SHA.'
    )
  })

  it('throws an error when the githubServerUrl is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    github.context.serverUrl = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_SERVER_URL.'
    )
  })

  it('throws an error when the repositoryId is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    process.env.GITHUB_REPOSITORY_ID = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_REPOSITORY_ID.'
    )
  })

  it('throws an error when the repositoryOwnerId is not provided', async () => {
    getInputMock.mockReturnValueOnce('token')
    process.env.GITHUB_REPOSITORY_OWNER_ID = ''

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find GITHUB_REPOSITORY_OWNER_ID.'
    )
  })

  it('throws an error when getting the container registry URL fails', async () => {
    getInputMock.mockReturnValueOnce('token')
    getContainerRegistryURLMock.mockRejectedValue(
      new Error('Failed to get container registry URL')
    )

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Failed to get container registry URL'
    )
  })

  it('throws an error when getting the repository metadata fails', async () => {
    getInputMock.mockReturnValueOnce('token')
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)
    getRepositoryMetadataMock.mockRejectedValue(
      new Error('Failed to get repository metadata')
    )

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Failed to get repository metadata'
    )
  })

  it('throws an error when returned repository visibility is empty', async () => {
    getInputMock.mockReturnValueOnce('token')
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)
    getRepositoryMetadataMock.mockResolvedValue({
      visibility: ''
    })

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Could not find repository visibility.'
    )
  })

  it('throws an error when returned repository id does not match env var', async () => {
    getInputMock.mockReturnValueOnce('token')
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)
    getRepositoryMetadataMock.mockResolvedValue({
      visibility: 'public',
      ownerId: '12345',
      repoId: '54321'
    })

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Repository ID mismatch.'
    )
  })

  it('throws an error when returned repository owner id does not match env var', async () => {
    getInputMock.mockReturnValueOnce('token')
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)
    getRepositoryMetadataMock.mockResolvedValue({
      visibility: 'public',
      ownerId: '123124',
      repoId: 'repositoryId'
    })

    await expect(cfg.resolvePublishActionOptions()).rejects.toThrow(
      'Repository Owner ID mismatch.'
    )
  })

  it('returns options when all values are present', async () => {
    getInputMock.mockImplementation((name: string) => {
      expect(name).toBe('github-token')
      return 'token'
    })
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)

    getRepositoryMetadataMock.mockResolvedValue({
      visibility: 'public',
      repoId: 'repositoryId',
      ownerId: 'repositoryOwnerId'
    })

    const options = await cfg.resolvePublishActionOptions()

    expect(options).toEqual({
      nameWithOwner: 'nameWithOwner',
      ref: 'ref',
      workspaceDir: 'workspaceDir',
      event: 'release',
      apiBaseUrl: 'apiBaseUrl',
      runnerTempDir: 'runnerTempDir',
      sha: 'sha',
      repositoryVisibility: 'public',
      repositoryId: 'repositoryId',
      repositoryOwnerId: 'repositoryOwnerId',
      isEnterprise: false,
      containerRegistryUrl: ghcrUrl,
      token: 'token'
    })
  })

  it('sets enterprise to true when the server URL is not github.com or ghe.com', async () => {
    getInputMock.mockImplementation((name: string) => {
      expect(name).toBe('github-token')
      return 'token'
    })
    getContainerRegistryURLMock.mockResolvedValue(ghcrUrl)

    getRepositoryMetadataMock.mockResolvedValue({
      visibility: 'public',
      repoId: 'repositoryId',
      ownerId: 'repositoryOwnerId'
    })

    github.context.serverUrl = 'https://github-enterprise.com'

    const options = await cfg.resolvePublishActionOptions()

    expect(options).toEqual({
      nameWithOwner: 'nameWithOwner',
      ref: 'ref',
      workspaceDir: 'workspaceDir',
      event: 'release',
      apiBaseUrl: 'apiBaseUrl',
      runnerTempDir: 'runnerTempDir',
      sha: 'sha',
      repositoryId: 'repositoryId',
      repositoryOwnerId: 'repositoryOwnerId',
      isEnterprise: true,
      containerRegistryUrl: ghcrUrl,
      token: 'token',
      repositoryVisibility: 'public'
    })
  })
})

describe('config.serializeOptions', () => {
  it('serializes the options, ignoring internal keys', () => {
    const options: cfg.PublishActionOptions = {
      nameWithOwner: 'nameWithOwner',
      ref: 'ref',
      workspaceDir: 'workspaceDir',
      event: 'release',
      apiBaseUrl: 'apiBaseUrl',
      runnerTempDir: 'runnerTempDir',
      sha: 'sha',
      repositoryId: 'repositoryId',
      repositoryOwnerId: 'repositoryOwnerId',
      isEnterprise: false,
      containerRegistryUrl: ghcrUrl,
      token: 'token',
      repositoryVisibility: 'public'
    }

    const serialized = cfg.serializeOptions(options)

    // Parse the JSON
    const parsed = JSON.parse(serialized)

    expect(parsed.nameWithOwner).toBe('nameWithOwner')
    expect(parsed.ref).toBe('ref')
    expect(parsed.workspaceDir).toBe('workspaceDir')
    expect(parsed.event).toBe('release')
    expect(parsed.apiBaseUrl).toBe('apiBaseUrl')
    expect(parsed.sha).toBe('sha')
    expect(parsed.isEnterprise).toBe(false)
    expect(parsed.containerRegistryUrl).toBe(ghcrUrl.toString())
    expect(parsed.token).toBeUndefined()
    expect(parsed.repositoryId).toBeUndefined()
    expect(parsed.repositoryOwnerId).toBeUndefined()
    expect(parsed.runnerTempDir).toBeUndefined()
  })
})

function configureEventContext(): void {
  github.context.ref = 'ref'
  github.context.eventName = 'release'
  github.context.apiUrl = 'apiBaseUrl'
  github.context.sha = 'sha'
  github.context.serverUrl = 'https://github.com/'
  github.context.payload = {
    repository: {
      full_name: 'nameWithOwner',
      name: 'name',
      owner: {
        login: 'owner'
      }
    }
  }

  process.env.RUNNER_TEMP = 'runnerTempDir'
  process.env.GITHUB_WORKSPACE = 'workspaceDir'
  process.env.GITHUB_REPOSITORY_ID = 'repositoryId'
  process.env.GITHUB_REPOSITORY_OWNER_ID = 'repositoryOwnerId'
}

function clearEventContext(): void {
  github.context.ref = ''
  github.context.eventName = ''
  github.context.apiUrl = ''
  github.context.sha = ''
  github.context.serverUrl = ''
  github.context.payload = {}
  process.env.RUNNER_TEMP = ''
  process.env.GITHUB_WORKSPACE = ''
  process.env.GITHUB_REPOSITORY_ID = ''
  process.env.GITHUB_REPOSITORY_OWNER_ID = ''
}
