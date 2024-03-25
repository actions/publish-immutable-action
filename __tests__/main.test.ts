/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as attest from '@actions/attest'
import * as main from '../src/main'
import * as cfg from '../src/config'
import * as fsHelper from '../src/fs-helper'
import * as ghcr from '../src/ghcr-client'

const ghcrUrl = new URL('https://ghcr.io')

// Mock the GitHub Actions core library
let setFailedMock: jest.SpyInstance
let setOutputMock: jest.SpyInstance

// Mock the IA Toolkit
let createTempDirMock: jest.SpyInstance
let createArchivesMock: jest.SpyInstance
let stageActionFilesMock: jest.SpyInstance
let publishOCIArtifactMock: jest.SpyInstance

// Mock the config resolution
let resolvePublishActionOptionsMock: jest.SpyInstance

// Mock generating attestation
let generateAttestationMock: jest.SpyInstance

describe('run', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Core mocks
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

    // FS mocks
    createTempDirMock = jest
      .spyOn(fsHelper, 'createTempDir')
      .mockImplementation()
    createArchivesMock = jest
      .spyOn(fsHelper, 'createArchives')
      .mockImplementation()
    stageActionFilesMock = jest
      .spyOn(fsHelper, 'stageActionFiles')
      .mockImplementation()

    // GHCR Client mocks
    publishOCIArtifactMock = jest
      .spyOn(ghcr, 'publishOCIArtifact')
      .mockImplementation()

    // Config mocks
    resolvePublishActionOptionsMock = jest
      .spyOn(cfg, 'resolvePublishActionOptions')
      .mockImplementation()

    // Attestation mocks
    generateAttestationMock = jest
      .spyOn(attest, 'attestProvenance')
      .mockImplementation()
  })

  it('fails if the action ref is not a tag', async () => {
    const options = baseOptions()
    options.ref = 'refs/heads/main' // This is a branch, not a tag
    resolvePublishActionOptionsMock.mockReturnValueOnce(options)

    await main.run()

    expect(setFailedMock).toHaveBeenCalledWith(
      'The ref refs/heads/main is not a valid tag reference.'
    )
  })

  it('fails if the value of the tag ref is not a valid semver', async () => {
    const tags = ['test', 'v1.0', 'chicken', '111111']

    for (const tag of tags) {
      const options = baseOptions()
      options.ref = `refs/tags/${tag}`
      resolvePublishActionOptionsMock.mockReturnValueOnce(options)

      await main.run()
      expect(setFailedMock).toHaveBeenCalledWith(
        `${tag} is not a valid semantic version tag, and so cannot be uploaded to the action package.`
      )
    }
  })

  it('fails if creating staging temp directory fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if staging files fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      return 'tmpDir/staging'
    })

    stageActionFilesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if creating archives temp directory fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation((_, path: string) => {
      if (path === 'staging') {
        return 'staging'
      }
      throw new Error('Something went wrong')
    })

    stageActionFilesMock.mockImplementation(() => {})

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if creating archives fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      return 'stagingOrArchivesDir'
    })

    stageActionFilesMock.mockImplementation(() => {})

    createArchivesMock.mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if publishing OCI artifact fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      return 'stagingOrArchivesDir'
    })

    stageActionFilesMock.mockImplementation(() => {})

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
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('fails if creating attestation fails', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      return 'stagingOrArchivesDir'
    })

    stageActionFilesMock.mockImplementation(() => {})

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
      return {
        packageURL: 'https://ghcr.io/v2/test-org/test-repo:1.2.3',
        manifestDigest: 'sha256:my-test-digest'
      }
    })

    generateAttestationMock.mockImplementation(async () => {
      throw new Error('Something went wrong')
    })

    // Run the action
    await main.run()

    // Check the results
    expect(setFailedMock).toHaveBeenCalledWith('Something went wrong')
  })

  it('uploads the artifact, returns package metadata from GHCR, and creates an attestation in enterprise', async () => {
    const options = baseOptions()
    options.isEnterprise = true
    resolvePublishActionOptionsMock.mockReturnValue(options)

    createTempDirMock.mockImplementation(() => {
      return 'stagingOrArchivesDir'
    })

    stageActionFilesMock.mockImplementation(() => {})

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
      return {
        packageURL: 'https://ghcr.io/v2/test-org/test-repo:1.2.3',
        manifestDigest: 'sha256:my-test-digest'
      }
    })

    // Run the action
    await main.run()

    // Check the results
    expect(publishOCIArtifactMock).toHaveBeenCalledTimes(1)

    // Check outputs
    expect(setOutputMock).toHaveBeenCalledTimes(3)

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-url',
      'https://ghcr.io/v2/test-org/test-repo:1.2.3'
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest',
      expect.any(String)
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest-sha',
      'sha256:my-test-digest'
    )
  })

  it('uploads the artifact, returns package metadata from GHCR, and creates an attestation in non-enterprise', async () => {
    resolvePublishActionOptionsMock.mockReturnValue(baseOptions())

    createTempDirMock.mockImplementation(() => {
      return 'stagingOrArchivesDir'
    })

    stageActionFilesMock.mockImplementation(() => {})

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
      return {
        packageURL: 'https://ghcr.io/v2/test-org/test-repo:1.2.3',
        manifestDigest: 'sha256:my-test-digest'
      }
    })

    generateAttestationMock.mockImplementation(async () => {
      return {
        attestationID: 'test-attestation-id',
        certificate: 'test',
        bundle: {
          mediaType: 'application/vnd.cncf.notary.v2+jwt',
          verificationMaterial: {
            publicKey: {
              hint: 'test-hint'
            }
          }
        }
      }
    })

    // Run the action
    await main.run()

    // Check the results
    expect(publishOCIArtifactMock).toHaveBeenCalledTimes(1)

    // Check outputs
    expect(setOutputMock).toHaveBeenCalledTimes(4)

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-url',
      'https://ghcr.io/v2/test-org/test-repo:1.2.3'
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest',
      expect.any(String)
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'package-manifest-sha',
      'sha256:my-test-digest'
    )

    expect(setOutputMock).toHaveBeenCalledWith(
      'attestation-id',
      'test-attestation-id'
    )
  })
})

function baseOptions(): cfg.PublishActionOptions {
  return {
    nameWithOwner: 'nameWithOwner',
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
    ref: 'refs/tags/v1.2.3'
  }
}
