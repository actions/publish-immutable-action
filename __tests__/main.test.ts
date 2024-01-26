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

// Mock the GitHub Actions core library
let getInputMock: jest.SpyInstance
let setFailedMock: jest.SpyInstance
let setOutputMock: jest.SpyInstance

// Mock the filesystem helper
let createTempDirMock: jest.SpyInstance
let createArchivesMock: jest.SpyInstance
let removeDirMock: jest.SpyInstance
let getConsolidatedDirectoryMock: jest.SpyInstance
let isActionRepoMock: jest.SpyInstance

// Mock the GHCR Client
let publishOCIArtifactMock: jest.SpyInstance

describe('action', () => {
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
    getConsolidatedDirectoryMock = jest
      .spyOn(fsHelper, 'getConsolidatedDirectory')
      .mockImplementation()
    isActionRepoMock = jest.spyOn(fsHelper, 'isActionRepo').mockImplementation()

    // GHCR Client mocks
    publishOCIArtifactMock = jest
      .spyOn(ghcr, 'publishOCIArtifact')
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

  it('fails if event is not a release', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'push'

    // Run the action
    await main.run('directory1 directory2')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith(
      'Please ensure you have the workflow trigger as release.'
    )
  })

  it('fails if release tag is not a valid semantic version', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'invalid-tag'
      }
    }

    // Run the action
    await main.run('directory1 directory2')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith(
      'invalid-tag is not a valid semantic version, and so cannot be uploaded as an Immutable Action.'
    )
  })

  it('fails if multiple paths are provided and staging files fails', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }
    getInputMock.mockImplementation((name: string) => {
      if (name === 'path') {
        return 'directory1 directory2'
      } else if (name === 'registry') {
        return 'https://ghcr.io'
      }
      return ''
    })

    getConsolidatedDirectoryMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('directory1 directory2')

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if an error is thrown from dependent code', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.2.3'
      }
    }
    getInputMock.mockImplementation((name: string) => {
      if (name === 'path') {
        return 'directory'
      } else if (name === 'registry') {
        return 'https://ghcr.io'
      }
      return ''
    })

    getConsolidatedDirectoryMock.mockImplementation(() => {
      return { consolidatedDirectory: '/tmp/test', needToCleanUpDir: false }
    })
    isActionRepoMock.mockImplementation(() => true)

    createTempDirMock.mockImplementation(() => '/tmp/test')

    createArchivesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run('directory')

    // Check the results
    expect(getConsolidatedDirectoryMock).toHaveBeenCalledTimes(1)
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')

    // Expect the files to be cleaned up
    expect(removeDirMock).toHaveBeenCalledWith('/tmp/test')
  })

  it('successfully uploads if the release tag is a semver without v prefix', async () => {
    await testHappyPath('1.2.3', 'test')
  })

  it('successfully uploads if the release tag is a semver with v prefix', async () => {
    await testHappyPath('v1.2.3', 'test')
  })

  it('successfully uploads if multiple paths are provided', async () => {
    await testHappyPath('v1.2.3', 'test test2')
  })
})

// Test that main successfully uploads and returns the manifest & package URL
async function testHappyPath(version: string, path: string): Promise<void> {
  // Mock the environment
  process.env.GITHUB_REPOSITORY = 'test-org/test-repo'
  github.context.eventName = 'release'
  github.context.payload = {
    release: {
      id: '123',
      tag_name: version
    }
  }
  getInputMock.mockImplementation((name: string) => {
    if (name === 'path') {
      return path
    } else if (name === 'registry') {
      return 'https://ghcr.io'
    }
    return ''
  })

  isActionRepoMock.mockImplementation(() => true)

  getConsolidatedDirectoryMock.mockImplementation(() => {
    return { consolidatedDirectory: '/tmp/test', needToCleanUpDir: false } // TODO: I don't understand why I have to name the variables here but not in the implementation code
  })

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

  publishOCIArtifactMock.mockImplementation(() => {
    return new URL('https://ghcr.io/v2/test-org/test-repo:1.2.3')
  })

  // Run the action
  await main.run(path)

  expect(publishOCIArtifactMock).toHaveBeenCalledTimes(1)

  // Check manifest is in output
  expect(setOutputMock).toHaveBeenCalledWith(
    'package-url',
    'https://ghcr.io/v2/test-org/test-repo:1.2.3'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'package-manifest',
    expect.any(String)
  )

  // Validate the manifest
  const manifest = JSON.parse(setOutputMock.mock.calls[1][1])
  expect(manifest.mediaType).toEqual(
    'application/vnd.oci.image.manifest.v1+json'
  )
  expect(manifest.config.mediaType).toEqual(
    'application/vnd.github.actions.package.config.v1+json'
  )
  expect(manifest.layers.length).toEqual(3)
  expect(manifest.annotations['com.github.package.type']).toEqual(
    'actions_oci_pkg'
  )

  // Expect all the temp files to be cleaned up
  expect(removeDirMock).toHaveBeenCalledWith('/tmp/test')
  expect(removeDirMock).toHaveBeenCalledTimes(
    createTempDirMock.mock.calls.length
  )
}
