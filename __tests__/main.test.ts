/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as main from '../src/main'
import * as github from '@actions/github'

import * as fsHelper from '../src/fs-helper'
import * as ghcr from '../src/ghcr-client'
import * as api from '../src/api-client'

// Mock the GitHub Actions core library
let getInputMock: jest.SpyInstance
let setFailedMock: jest.SpyInstance
let setOutputMock: jest.SpyInstance

// Mock the filesystem helper
let createTempDirMock: jest.SpyInstance
let createArchivesMock: jest.SpyInstance
let removeDirMock: jest.SpyInstance
let stageActionFilesMock: jest.SpyInstance

// Mock the GHCR Client
let publishOCIArtifactMock: jest.SpyInstance

// Mock the API Client
let getContainerRegistryURLMock: jest.SpyInstance
let getRepositoryMetadataMock: jest.SpyInstance

describe('run', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Core mocks
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

    // FS mocks
    createTempDirMock = jest
      .spyOn(fsHelper, 'createTempDir')
      .mockImplementation()
    createArchivesMock = jest
      .spyOn(fsHelper, 'createArchives')
      .mockImplementation()
    removeDirMock = jest.spyOn(fsHelper, 'removeDir').mockImplementation()
    stageActionFilesMock = jest
      .spyOn(fsHelper, 'stageActionFiles')
      .mockImplementation()

    // GHCR Client mocks
    publishOCIArtifactMock = jest
      .spyOn(ghcr, 'publishOCIArtifact')
      .mockImplementation()

    // API Client mocks
    getContainerRegistryURLMock = jest
      .spyOn(api, 'getContainerRegistryURL')
      .mockImplementation()

    getRepositoryMetadataMock = jest
      .spyOn(api, 'getRepositoryMetadata')
      .mockImplementation()
  })

  it('fails if no repository found', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = ''

    // Run the action
    await main.run('directory1 directory2')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Could not find Repository.')
  })

  it('fails if no token found', async () => {
    // Mock the environment
    process.env.TOKEN = ''

    // Run the action
    await main.run('directory1 directory2')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Could not find Repository.')
  })

  it('fails if no source commit found', async () => {
    // Mock the environment
    process.env.GITHUB_SHA = ''

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Could not find Repository.')
  })

  it('fails if trigger is not release or tag push', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'

    // TODO: If we want we can add all of these: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows
    const invalidEvents = ['workflow_dispatch, pull_request, schedule']
    for (const event of invalidEvents) {
      github.context.eventName = event
      await main.run('')
      expect(setFailedMock).toHaveBeenCalledWith(
        'This action can only be triggered by release events or tag push events.'
      )
    }
  })

  it('fails if the trigger is a push, but not a tag push', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.eventName = 'push'
    github.context.ref = "refs/heads/main" // This is a branch, not a tag

    await main.run('')

    expect(setFailedMock).toHaveBeenCalledWith(
      'This action can only be triggered by release events or tag push events.'
    )
  })

  it('fails if the value of the tag input is not a valid semver', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.eventName = 'release'

    const tags = ['test', 'v1.0', 'chicken', '111111']

    for (const tag of tags) {
      github.context.payload = {
        release: {
          id: '123',
          tag_name: tag
        }
      }

      await main.run('')
      expect(setFailedMock).toHaveBeenCalledWith(
        `${tag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`
      )
    }
  })

  it('fails if staging files fails', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    stageActionFilesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if creating temp directory fails', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    createTempDirMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if creating archives fails', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    createArchivesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if getting container registry URL fails', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    createArchivesMock.mockImplementation(() => {
      return {
        zipFile: {
          path: 'test',
          size: 5,
          sha256: '123'
        },
        tarFile: {
          path: 'test2',
          size: 52,
          sha256: '1234'
        }
      }
    })

    getRepositoryMetadataMock.mockImplementation(() => {
      return { repoId: 'test', ownerId: 'test' }
    })

    getContainerRegistryURLMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if publishing OCI artifact fails', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    createArchivesMock.mockImplementation(() => {
      return {
        zipFile: {
          path: 'test',
          size: 5,
          sha256: '123'
        },
        tarFile: {
          path: 'test2',
          size: 52,
          sha256: '1234'
        }
      }
    })

    getRepositoryMetadataMock.mockImplementation(() => {
      return { repoId: 'test', ownerId: 'test' }
    })

    getContainerRegistryURLMock.mockImplementation(() => {
      return new URL('https://ghcr.io')
    })

    publishOCIArtifactMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('uploads the artifact, returns package metadata from GHCR, and cleans up tmp dirs', async () => {
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    process.env.GITHUB_SHA = 'test-sha'
    process.env.TOKEN = 'token'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }

    createTempDirMock.mockImplementation(() => '/tmp/test')

    createArchivesMock.mockImplementation(() => {
      return {
        zipFile: {
          path: 'test',
          size: 5,
          sha256: '123'
        },
        tarFile: {
          path: 'test2',
          size: 52,
          sha256: '1234'
        }
      }
    })

    getRepositoryMetadataMock.mockImplementation(() => {
      return { repoId: 'test', ownerId: 'test' }
    })

    getContainerRegistryURLMock.mockImplementation(() => {
      return new URL('https://ghcr.io')
    })

    publishOCIArtifactMock.mockImplementation(() => {
      return { packageURL: 'https://ghcr.io/v2/test-org/test-repo:1.2.3', manifestDigest: 'my-test-digest' }
    })

    // Run the action
    await main.run('')

    // Check the results
    expect(publishOCIArtifactMock).toHaveBeenCalledTimes(1)

    // Check outputs
    expect(setOutputMock).toHaveBeenCalledTimes(3)

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-url',
      'https://ghcr.io/v2/test-org/test-repo:1.2.3',
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest',
      expect.any(String)
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest-sha',
      'sha256:my-test-digest'
    )

    // Expect all the temp files to be cleaned up
    expect(removeDirMock).toHaveBeenCalledWith('/tmp/test')
    expect(removeDirMock).toHaveBeenCalledTimes(
      createTempDirMock.mock.calls.length
    )
  })
})
