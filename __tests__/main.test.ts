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
import * as ociContainer from '../src/oci-container'
import * as ghcr from '../src/ghcr-client'

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Mock the GitHub Actions core library
let debugMock: jest.SpyInstance
let errorMock: jest.SpyInstance
let getInputMock: jest.SpyInstance
let setFailedMock: jest.SpyInstance
let setOutputMock: jest.SpyInstance

// Mock the filesystem helper
let createTempDirMock: jest.SpyInstance
let isDirectoryMock: jest.SpyInstance
let createArchivesMock: jest.SpyInstance
let removeDirMock: jest.SpyInstance

// Mock the GHCR Client
let publishOCIArtifactMock: jest.SpyInstance

describe('action', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Core mocks
    debugMock = jest.spyOn(core, 'debug').mockImplementation()
    errorMock = jest.spyOn(core, 'error').mockImplementation()
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

    // FS mocks
    createTempDirMock = jest
      .spyOn(fsHelper, 'createTempDir')
      .mockImplementation()
    isDirectoryMock = jest.spyOn(fsHelper, 'isDirectory').mockImplementation()
    createArchivesMock = jest
      .spyOn(fsHelper, 'createArchives')
      .mockImplementation()
    removeDirMock = jest.spyOn(fsHelper, 'removeDir').mockImplementation()

    // GHCR Client mocks
    publishOCIArtifactMock = jest
      .spyOn(ghcr, 'publishOCIArtifact')
      .mockImplementation()
  })

  it('fails if no repository found', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = ''

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Could not find Repository.')
  })

  it('fails if event is not a release', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test/test'
    github.context.eventName = 'push'

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith(
      'Please ensure you have the workflow trigger as release.'
    )
  })

  it('fails if release tag is not a valid semantic version', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test/test'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'invalid-tag'
      }
    }

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith(
      'invalid-tag is not a valid semantic version, and so cannot be uploaded as an Immutable Action.'
    )
  })

  it('fails if path is not a directory', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test/test'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.0.0'
      }
    }
    getInputMock.mockImplementation((name: string) => {
      if (name === 'path') {
        return 'not-a-directory'
      } else if (name === 'registry') {
        return 'https://ghcr.io'
      }
      return ''
    })

    isDirectoryMock.mockImplementation(() => false)

    // Run the action
    await main.run()

    // Check the results
    expect(isDirectoryMock).toHaveBeenCalledWith('not-a-directory')
    expect(setFailedMock).toHaveBeenCalledWith(
      'The path not-a-directory is not a directory. Please provide a path to a valid directory.'
    )
  })

  it('fails if an error is thrown from dependent code', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test/test'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.0.0'
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

    isDirectoryMock.mockImplementation(() => true)

    createTempDirMock.mockImplementation(() => '/tmp/test')

    createArchivesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(isDirectoryMock).toHaveBeenCalledWith('directory')
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')

    // Expect the files to be cleaned up
    expect(removeDirMock).toHaveBeenCalledWith('/tmp/test')
  })

  it('uploads and returns the manifest & package URL if all succeeds', async () => {
    // Mock the environment
    process.env.GITHUB_REPOSITORY = 'test/test'
    github.context.eventName = 'release'
    github.context.payload = {
      release: {
        id: '123',
        tag_name: 'v1.0.0'
      }
    }
    getInputMock.mockImplementation((name: string) => {
      if (name === 'path') {
        return 'test'
      } else if (name === 'registry') {
        return 'https://ghcr.io'
      }
      return ''
    })

    isDirectoryMock.mockImplementation(() => true)

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
      return new URL('https://ghcr.io/v2/test/test:1.0.0')
    })

    // Run the action
    await main.run()

    expect(publishOCIArtifactMock).toHaveBeenCalledTimes(1)

    // Check manifest is in output
    expect(setOutputMock).toHaveBeenCalledWith(
      'package-url',
      'https://ghcr.io/v2/test/test:1.0.0'
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

    // Expect the files to be cleaned up
    expect(removeDirMock).toHaveBeenCalledWith('/tmp/test')
  })
})
