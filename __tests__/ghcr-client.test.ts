import { publishOCIArtifact } from '../src/ghcr-client'
import axios, { AxiosRequestConfig } from 'axios'
import * as fs from 'fs'
import * as fsHelper from '../src/fs-helper'
import * as ociContainer from '../src/oci-container'

// Mocks
let fsReadFileSyncMock: jest.SpyInstance
let axiosPostMock: jest.SpyInstance
let axiosPutMock: jest.SpyInstance
let axiosHeadMock: jest.SpyInstance

const token = '1234567890'
const registry = new URL('https://ghcr.io')
const repository = 'test/test'
const releaseId = '1234567890'
const semver = '1.0.0'
const zipFile: fsHelper.FileMetadata = {
  path: 'test-repo-1.0.0.zip',
  size: 100,
  sha256: '1234567890'
}
const tarFile: fsHelper.FileMetadata = {
  path: 'test-repo-1.0.0.tar.gz',
  size: 100,
  sha256: '1234567890'
}

const testManifest: ociContainer.Manifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  artifactType: 'application/vnd.oci.image.manifest.v1+json',
  config: {
    mediaType: 'application/vnd.github.actions.package.config.v1+json',
    size: 0,
    digest:
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    annotations: {
      'org.opencontainers.image.title': 'config.json'
    }
  },
  layers: [
    {
      mediaType: 'application/vnd.github.actions.package.config.v1+json',
      size: 0,
      digest:
        'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      annotations: {
        'org.opencontainers.image.title': 'config.json'
      }
    },
    {
      mediaType: 'application/vnd.github.actions.package.layer.v1.tar+gzip',
      size: 100,
      digest: 'sha256:1234567890',
      annotations: {
        'org.opencontainers.image.title': 'test-repo-1.0.0.tar.gz'
      }
    },
    {
      mediaType: 'application/vnd.github.actions.package.layer.v1.zip',
      size: 100,
      digest: 'sha256:1234567890',
      annotations: {
        'org.opencontainers.image.title': 'test-repo-1.0.0.zip'
      }
    }
  ],
  annotations: {
    'org.opencontainers.image.created': '2021-01-01T00:00:00.000Z',
    'action.tar.gz.digest': '1234567890',
    'action.zip.digest': '1234567890',
    'com.github.package.type': 'actions_oci_pkg'
  }
}

describe('publishOCIArtifact', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    fsReadFileSyncMock = jest
      .spyOn(fsHelper, 'readFileContents')
      .mockImplementation()

    axiosPostMock = jest.spyOn(axios, 'post').mockImplementation()
    axiosPutMock = jest.spyOn(axios, 'put').mockImplementation()
    axiosHeadMock = jest.spyOn(axios, 'head').mockImplementation()
  })

  it('publishes layer blobs & then a manifest to the provided registry', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(
      async (url: string, config: AxiosRequestConfig) => {
        validateRequestConfig(404, url, config)
        return {
          status: 404
        }
      }
    )

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: 'https://ghcr.io/v2/test/test/blobs/uploads/1234567890'
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(async path => {
      return Buffer.from('test')
    })

    // Simulate successful upload of all blobs & then the manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(201, url, config)
      return {
        status: 201
      }
    })

    await publishOCIArtifact(
      token,
      registry,
      repository,
      releaseId,
      semver,
      zipFile,
      tarFile,
      testManifest
    )

    expect(axiosHeadMock).toHaveBeenCalledTimes(3)
    expect(axiosPostMock).toHaveBeenCalledTimes(3)
    expect(axiosPutMock).toHaveBeenCalledTimes(4)

    // TODO: Check that the base64 encoded token is sent in the Authorization header
  })

  it('skips uploading layer blobs that already exist', async () => {
    // Simulate all blobs already existing
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(200, url, config)
      return {
        status: 200
      }
    })

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: 'https://ghcr.io/v2/test/test/blobs/uploads/1234567890'
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(async path => {
      return Buffer.from('test')
    })

    // Simulate successful upload of all blobs & then the manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(201, url, config)
      return {
        status: 201
      }
    })

    await publishOCIArtifact(
      token,
      registry,
      repository,
      releaseId,
      semver,
      zipFile,
      tarFile,
      testManifest
    )

    // We should only head all the blobs and then upload the manifest
    expect(axiosHeadMock).toHaveBeenCalledTimes(3)
    expect(axiosPostMock).toHaveBeenCalledTimes(0)
    expect(axiosPutMock).toHaveBeenCalledTimes(1)
  })

  it('throws an error if checking for existing blobs fails', async () => {
    // Simulate failed response code
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(503, url, config)
      return {
        status: 503
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow(/^Unexpected response from blob check for layer/)
  })

  it('throws an error if initiating layer upload fails', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(404, url, config)
      return {
        status: 404
      }
    })

    // Simulate failed initiation of uploads
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(503, url, config)
      return {
        status: 503
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow('Unexpected response from POST upload 503')
  })

  it('throws an error if the upload endpoint does not return a location', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(404, url, config)
      return {
        status: 404
      }
    })

    // Simulate successful response code but no location header
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {}
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow(/^No location header in response from upload post/)
  })

  it('throws an error if a layer upload fails', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(404, url, config)
      return {
        status: 404
      }
    })

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: 'https://ghcr.io/v2/test/test/blobs/uploads/1234567890'
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(async path => {
      return Buffer.from('test')
    })

    // Simulate fails upload of all blobs & manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(500, url, config)
      return {
        status: 500
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow(/^Unexpected response from PUT upload 500/)
  })

  it('throws an error if a manifest upload fails', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(404, url, config)
      return {
        status: 404
      }
    })

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: 'https://ghcr.io/v2/test/test/blobs/uploads/1234567890'
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(async path => {
      return Buffer.from('test')
    })

    // Simulate successful upload of all blobs & then the manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      if (url.includes('manifest')) {
        validateRequestConfig(500, url, config)
        return {
          status: 500
        }
      }

      validateRequestConfig(201, url, config)
      return {
        status: 201
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow(/^Unexpected response from PUT manifest 500/)
  })

  it('throws an error if reading one of the files fails', async () => {
    // Simulate none of the blobs existing currently
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(404, url, config)
      return {
        status: 404
      }
    })

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: 'https://ghcr.io/v2/test/test/blobs/uploads/1234567890'
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(path => {
      throw new Error('failed to read a file: test')
    })

    // Simulate successful upload of all blobs & then the manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(201, url, config)
      return {
        status: 201
      }
    })

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow('failed to read a file: test')
  })

  it('throws an error if one of the layers has the wrong media type', async () => {
    let modifiedTestManifest = testManifest
    modifiedTestManifest.layers[0].mediaType = 'application/json'

    expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        testManifest
      )
    ).rejects.toThrow('Unknown media type application/json')
  })
})

// We expect all axios calls to have auth headers set and to not intercept any status codes so we can handle them.
// This function verifies that given an axios request config.
function validateRequestConfig(
  status: number,
  url: string,
  config: AxiosRequestConfig
) {
  // Basic URL checks
  expect(url).toBeDefined()

  if (!url.startsWith(registry.toString())) {
    console.log(url)
  }

  expect(url.startsWith(registry.toString())).toBe(true)

  // Config checks
  expect(config).toBeDefined()

  expect(config.validateStatus).toBeDefined()
  if (config.validateStatus) {
    // Check axios will not intercept this status
    expect(config.validateStatus(status)).toBe(true)
  }

  expect(config.headers).toBeDefined()
  if (config.headers) {
    // Check the auth header is set
    expect(config.headers.Authorization).toBeDefined()
    // Check the auth header is the base 64 encoded token
    expect(config.headers.Authorization).toBe(
      `Bearer ${Buffer.from(token).toString('base64')}`
    )
  }
}
