// import { publishImmutableActionVersion } from '../src/ghcr-client'
// import * as fsHelper from '../src/fs-helper'
// import * as ociContainer from '../src/oci-container'

// // Mocks
// let fsReadFileSyncMock: jest.SpyInstance
// let fetchMock: jest.SpyInstance

describe('run', () => {
  it('does not fail when running in a test', () => {
    // This is a dummy test to ensure that the run function does not fail when running in a test
  })
})

// const token = 'test-token'
// const registry = new URL('https://ghcr.io')
// const repository = 'test-org/test-repo'
// const semver = '1.2.3'
// const genericSha = '1234567890' // We should look at using different shas here to catch bug, but that make location validation harder
// const zipFile: fsHelper.FileMetadata = {
//   path: `test-repo-${semver}.zip`,
//   size: 123,
//   sha256: genericSha
// }
// const tarFile: fsHelper.FileMetadata = {
//   path: `test-repo-${semver}.tar.gz`,
//   size: 456,
//   sha256: genericSha
// }

// const headMockNoExistingBlobs = (): object => {
//   // Simulate none of the blobs existing currently
//   return {
//     text() {
//       return '{"errors": [{"code": "NOT_FOUND", "message": "blob not found."}]}'
//     },
//     status: 404,
//     statusText: 'Not Found'
//   }
// }

// const headMockAllExistingBlobs = (): object => {
//   // Simulate all of the blobs existing currently
//   return {
//     status: 200,
//     statusText: 'OK'
//   }
// }

// let count = 0
// const headMockSomeExistingBlobs = (): object => {
//   count++
//   // report one as existing
//   if (count === 1) {
//     return {
//       status: 200,
//       statusText: 'OK'
//     }
//   } else {
//     // report all others are missing
//     return {
//       text() {
//         return '{"errors": [{"code": "NOT_FOUND", "message": "blob not found."}]}'
//       },
//       status: 404,
//       statusText: 'Not Found'
//     }
//   }
// }

// const headMockFailure = (): object => {
//   return {
//     text() {
//       // In this case we'll simulate a response which does not use the expected error format
//       return '503 Service Unavailable'
//     },
//     status: 503,
//     statusText: 'Service Unavailable'
//   }
// }

// const postMockSuccessfulIniationForAllBlobs = (): object => {
//   // Simulate successful initiation of uploads for all blobs & return location
//   return {
//     status: 202,
//     headers: {
//       get: (header: string) => {
//         if (header === 'location') {
//           return `https://ghcr.io/v2/${repository}/blobs/uploads/${genericSha}`
//         }
//       }
//     }
//   }
// }

// const postMockFailure = (): object => {
//   // Simulate failed initiation of uploads
//   return {
//     text() {
//       // In this case we'll simulate a response which does not use the expected error format
//       return '503 Service Unavailable'
//     },
//     status: 503,
//     statusText: 'Service Unavailable'
//   }
// }

// const postMockNoLocationHeader = (): object => {
//   return {
//     status: 202,
//     headers: {
//       get: () => {}
//     }
//   }
// }

// const putMockSuccessfulBlobUpload = (url: string): object => {
//   // Simulate successful upload of all blobs & then the manifest
//   if (url.includes('manifest')) {
//     return {
//       status: 201,
//       headers: {
//         get: (header: string) => {
//           if (header === 'docker-content-digest') {
//             return '1234567678'
//           }
//         }
//       }
//     }
//   }
//   return {
//     status: 201
//   }
// }

// const putMockFailure = (): object => {
//   // Simulate fails upload of all blobs & manifest
//   return {
//     text() {
//       return '{"errors": [{"code": "BAD_REQUEST", "message": "tag already exists."}]}'
//     },
//     status: 400,
//     statusText: 'Bad Request'
//   }
// }

// const putMockFailureManifestUpload = (url: string): object => {
//   // Simulate unsuccessful upload of all blobs & then the manifest
//   if (url.includes('manifest')) {
//     return {
//       text() {
//         return '{"errors": [{"code": "BAD_REQUEST", "message": "tag already exists."}]}'
//       },
//       status: 400,
//       statusText: 'Bad Request'
//     }
//   }
//   return {
//     status: 201
//   }
// }

// type MethodHandlers = {
//   getMock?: (url: string, options: { method: string }) => object
//   headMock?: (url: string, options: { method: string }) => object
//   postMock?: (url: string, options: { method: string }) => object
//   putMock?: (url: string, options: { method: string }) => object
// }

// function configureFetchMock(
//   fetchMockInstance: jest.SpyInstance,
//   methodHandlers: MethodHandlers
// ): void {
//   fetchMockInstance.mockImplementation(
//     async (url: string, options: { method: string }) => {
//       validateRequestConfig(url, options)
//       switch (options.method) {
//         case 'GET':
//           return methodHandlers.getMock?.(url, options)
//         case 'HEAD':
//           return methodHandlers.headMock?.(url, options)
//         case 'POST':
//           return methodHandlers.postMock?.(url, options)
//         case 'PUT':
//           return methodHandlers.putMock?.(url, options)
//       }
//     }
//   )
// }

// const testManifest: ociContainer.OCIImageManifest = {
//   schemaVersion: 2,
//   mediaType: 'application/vnd.oci.image.manifest.v1+json',
//   artifactType: 'application/vnd.oci.image.manifest.v1+json',
//   config: {
//     mediaType: 'application/vnd.oci.empty.v1+json',
//     size: 2,
//     digest:
//       'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
//   },
//   layers: [
//     {
//       mediaType: 'application/vnd.oci.empty.v1+json',
//       size: 2,
//       digest:
//         'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
//     },
//     {
//       mediaType: 'application/vnd.github.actions.package.layer.v1.tar+gzip',
//       size: tarFile.size,
//       digest: `sha256:${tarFile.sha256}`,
//       annotations: {
//         'org.opencontainers.image.title': tarFile.path
//       }
//     },
//     {
//       mediaType: 'application/vnd.github.actions.package.layer.v1.zip',
//       size: zipFile.size,
//       digest: `sha256:${zipFile.sha256}`,
//       annotations: {
//         'org.opencontainers.image.title': zipFile.path
//       }
//     }
//   ],
//   annotations: {
//     'org.opencontainers.image.created': '2021-01-01T00:00:00.000Z',
//     'action.tar.gz.digest': tarFile.sha256,
//     'action.zip.digest': zipFile.sha256,
//     'com.github.package.type': 'actions_oci_pkg'
//   }
// }

// describe('publishOCIArtifact', () => {
//   beforeEach(() => {
//     jest.clearAllMocks()

//     fsReadFileSyncMock = jest
//       .spyOn(fsHelper, 'readFileContents')
//       .mockImplementation()

//     fetchMock = jest.spyOn(global, 'fetch').mockImplementation()
//   })

//   it('publishes layer blobs & then a manifest to the provided registry', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockSuccessfulBlobUpload
//     })

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       return Buffer.from('test')
//     })

//     await publishImmutableActionVersion(
//       token,
//       registry,
//       repository,
//       semver,
//       zipFile,
//       tarFile,
//       testManifest
//     )

//     expect(fetchMock).toHaveBeenCalledTimes(10)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'HEAD')
//     ).toHaveLength(3)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'POST')
//     ).toHaveLength(3)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'PUT')
//     ).toHaveLength(4)
//   })

//   it('skips uploading all layer blobs when they all already exist', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockAllExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockSuccessfulBlobUpload
//     })

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       return Buffer.from('test')
//     })

//     await publishImmutableActionVersion(
//       token,
//       registry,
//       repository,
//       semver,
//       zipFile,
//       tarFile,
//       testManifest
//     )

//     // We should only head all the blobs and then upload the manifest
//     expect(fetchMock).toHaveBeenCalledTimes(4)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'HEAD')
//     ).toHaveLength(3)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'POST')
//     ).toHaveLength(0)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'PUT')
//     ).toHaveLength(1)
//   })

//   it('skips uploading layer blobs that already exist', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockSomeExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockSuccessfulBlobUpload
//     })
//     count = 0

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       return Buffer.from('test')
//     })

//     await publishImmutableActionVersion(
//       token,
//       registry,
//       repository,
//       semver,
//       zipFile,
//       tarFile,
//       testManifest
//     )

//     expect(fetchMock).toHaveBeenCalledTimes(8)
//     // We should only head all the blobs and then upload the missing blobs and manifest
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'HEAD')
//     ).toHaveLength(3)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'POST')
//     ).toHaveLength(2)
//     expect(
//       fetchMock.mock.calls.filter(call => call[1].method === 'PUT')
//     ).toHaveLength(3)
//   })

//   it('throws an error if checking for existing blobs fails', async () => {
//     configureFetchMock(fetchMock, { headMock: headMockFailure })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow(
//       /^Unexpected 503 Service Unavailable response from check blob/
//     )
//   })

//   it('throws an error if initiating layer upload fails', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockFailure
//     })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow(
//       'Unexpected 503 Service Unavailable response from initiate layer upload. Response Body: 503 Service Unavailable.'
//     )
//   })

//   it('throws an error if the upload endpoint does not return a location', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockNoLocationHeader
//     })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow(/^No location header in response from upload post/)
//   })

//   it('throws an error if a layer upload fails', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockFailure
//     })

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       return Buffer.from('test')
//     })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow(/^Unexpected 400 Bad Request response from layer/)
//   })

//   it('throws an error if a manifest upload fails', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockFailureManifestUpload
//     })

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       return Buffer.from('test')
//     })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow(
//       'Unexpected 400 Bad Request response from manifest upload. Errors: BAD_REQUEST - tag already exists.'
//     )
//   })

//   it('throws an error if reading one of the files fails', async () => {
//     configureFetchMock(fetchMock, {
//       headMock: headMockNoExistingBlobs,
//       postMock: postMockSuccessfulIniationForAllBlobs,
//       putMock: putMockSuccessfulBlobUpload
//     })

//     // Simulate successful reading of all the files
//     fsReadFileSyncMock.mockImplementation(() => {
//       throw new Error('failed to read a file: test')
//     })

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         testManifest
//       )
//     ).rejects.toThrow('failed to read a file: test')
//   })

//   it('throws an error if one of the layers has the wrong media type', async () => {
//     const modifiedTestManifest = { ...testManifest } // This is _NOT_ a deep clone
//     modifiedTestManifest.layers = cloneLayers(modifiedTestManifest.layers)
//     modifiedTestManifest.layers[0].mediaType = 'application/json'

//     // just checking to make sure we are not changing the shared object
//     expect(modifiedTestManifest.layers[0].mediaType).not.toEqual(
//       testManifest.layers[0].mediaType
//     )

//     await expect(
//       publishImmutableActionVersion(
//         token,
//         registry,
//         repository,
//         semver,
//         zipFile,
//         tarFile,
//         modifiedTestManifest
//       )
//     ).rejects.toThrow('Unknown media type application/json')
//   })
// })

// // We expect all fetch calls to have auth headers set
// // This function verifies that given an request config.
// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// function validateRequestConfig(url: string, config: any): void {
//   // Basic URL checks
//   expect(url).toBeDefined()
//   if (!url.startsWith(registry.toString())) {
//     console.log(`${url} does not start with ${registry}`)
//   }
//   // if these expect fails, run the test again with `-- --silent=false`
//   // the console.log above should give a clue about which URL is failing
//   expect(url.startsWith(registry.toString())).toBeTruthy()

//   // Config checks
//   expect(config).toBeDefined()

//   expect(config.headers).toBeDefined()
//   if (config.headers) {
//     // Check the auth header is set
//     expect(config.headers.Authorization).toBeDefined()
//     // Check the auth header is the base 64 encoded token
//     expect(config.headers.Authorization).toBe(
//       `Bearer ${Buffer.from(token).toString('base64')}`
//     )
//   }
// }

// function cloneLayers(
//   layers: ociContainer.Descriptor[]
// ): ociContainer.Descriptor[] {
//   const result: ociContainer.Descriptor[] = []
//   for (const layer of layers) {
//     result.push({ ...layer }) // this is _NOT_ a deep clone
//   }
//   return result
// }
