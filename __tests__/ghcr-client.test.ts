import { publishOCIArtifact } from '../src/ghcr-client'
import axios from 'axios'
import * as fsHelper from '../src/fs-helper'
import * as ociContainer from '../src/oci-container'

// Mocks
let fsReadFileSyncMock: jest.SpyInstance
let axiosPostMock: jest.SpyInstance
let axiosPutMock: jest.SpyInstance
let axiosHeadMock: jest.SpyInstance

const token = 'test-token'
const registry = new URL('https://ghcr.io')
const repository = 'test-org/test-repo'
const releaseId = 'test-release-id'
const semver = '1.2.3'
const genericSha = '1234567890' // We should look at using different shas here to catch bug, but that make location validation harder
const zipFile: fsHelper.FileMetadata = {
  path: `test-repo-{semver}.zip`,
  size: 123,
  sha256: genericSha
}
const tarFile: fsHelper.FileMetadata = {
  path: `test-repo-{semver}.tar.gz`,
  size: 456,
  sha256: genericSha
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
      size: tarFile.size,
      digest: `sha256:{tarFile.sha256}`,
      annotations: {
        'org.opencontainers.image.title': tarFile.path
      }
    },
    {
      mediaType: 'application/vnd.github.actions.package.layer.v1.zip',
      size: zipFile.size,
      digest: `sha256:{zipFile.sha256}`,
      annotations: {
        'org.opencontainers.image.title': zipFile.path
      }
    }
  ],
  annotations: {
    'org.opencontainers.image.created': '2021-01-01T00:00:00.000Z',
    'action.tar.gz.digest': tarFile.sha256,
    'action.zip.digest': zipFile.sha256,
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
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
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

  it('skips uploading all layer blobs when they all already exist', async () => {
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
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
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

  it('skips uploading layer blobs that already exist', async () => {
    // Simulate some blobs already existing

    var count = 0
    axiosHeadMock.mockImplementation(async (url, config) => {
      count++
      if (count === 1) {
        // report the first blob as being there
        validateRequestConfig(200, url, config)
        return {
          status: 200
        }
      } else {
        // report all others are missing
        validateRequestConfig(404, url, config)
        return {
          status: 404
        }
      }
    })

    // Simulate successful initiation of uploads for all blobs & return location
    axiosPostMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(202, url, config)
      return {
        status: 202,
        headers: {
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
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

    // We should only head all the blobs and then upload the missing blobs and manifest
    expect(axiosHeadMock).toHaveBeenCalledTimes(3)
    expect(axiosPostMock).toHaveBeenCalledTimes(2)
    expect(axiosPutMock).toHaveBeenCalledTimes(3)
  })

  it('throws an error if checking for existing blobs fails', async () => {
    // Simulate failed response code
    axiosHeadMock.mockImplementation(async (url, config) => {
      validateRequestConfig(503, url, config)
      return {
        status: 503
      }
    })

    await expect(
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

    await expect(
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

    await expect(
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
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
      return Buffer.from('test')
    })

    // Simulate fails upload of all blobs & manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(500, url, config)
      return {
        status: 500
      }
    })

    await expect(
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
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
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

    await expect(
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
          location: `https://ghcr.io/v2/{repository}/blobs/uploads/{genericSha}`
        }
      }
    })

    // Simulate successful reading of all the files
    fsReadFileSyncMock.mockImplementation(() => {
      throw new Error('failed to read a file: test')
    })

    // Simulate successful upload of all blobs & then the manifest
    axiosPutMock.mockImplementation(async (url, data, config) => {
      validateRequestConfig(201, url, config)
      return {
        status: 201
      }
    })

    await expect(
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
    const modifiedTestManifest = { ...testManifest } // This is _NOT_ a deep clone
    modifiedTestManifest.layers = cloneLayers(modifiedTestManifest.layers)
    modifiedTestManifest.layers[0].mediaType = 'application/json'

    // just checking to make sure we are not changing the shared object
    expect(modifiedTestManifest.layers[0].mediaType).not.toEqual(testManifest.layers[0].mediaType)

    await expect(
      publishOCIArtifact(
        token,
        registry,
        repository,
        releaseId,
        semver,
        zipFile,
        tarFile,
        modifiedTestManifest
      )
    ).rejects.toThrow('Unknown media type application/json')
  })
})

// We expect all axios calls to have auth headers set and to not intercept any status codes so we can handle them.
// This function verifies that given an axios request config.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateRequestConfig(status: number, url: string, config: any): void {
  // Basic URL checks
  expect(url).toBeDefined()
  if (!url.startsWith(registry.toString())) {
    console.log(`{url} does not start with {registry}`)
  }
  // if these expect fails, run the test again with `-- --silent=false`
  // the console.log above should give a clue about which URL is failing
  expect(url.startsWith(registry.toString())).toBeTruthy()

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

function cloneLayers(layers: ociContainer.Layer[]) : ociContainer.Layer[] {
  const result : ociContainer.Layer[] = [];
  layers.forEach(val => result.push({ ... val })) // this is _NOT_ a deep clone
  return result
}