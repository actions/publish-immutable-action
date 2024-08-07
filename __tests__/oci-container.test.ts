import { createActionPackageManifest, sha256Digest } from '../src/oci-container'
import { FileMetadata } from '../src/fs-helper'

describe('sha256Digest', () => {
  it('calculates the SHA256 digest of the provided manifest', () => {
    const date = new Date('2021-01-01T00:00:00Z')
    const repo = 'test-org/test-repo'
    const version = '1.2.3'
    const repoId = '123'
    const ownerId = '456'
    const sourceCommit = 'abc'
    const tarFile: FileMetadata = {
      path: '/test/test/test.tar.gz',
      sha256: 'tarSha',
      size: 123
    }
    const zipFile: FileMetadata = {
      path: '/test/test/test.zip',
      sha256: 'zipSha',
      size: 456
    }

    const manifest = createActionPackageManifest(
      tarFile,
      zipFile,
      repo,
      repoId,
      ownerId,
      sourceCommit,
      version,
      date
    )

    const digest = sha256Digest(manifest)
    const expectedDigest =
      'sha256:dd8537ef913cf87e25064a074973ed2c62699f1dbd74d0dd78e85d394a5758b5'

    expect(digest).toEqual(expectedDigest)
  })
})

describe('createActionPackageManifest', () => {
  it('creates a manifest containing the provided information', () => {
    const date = new Date()
    const repo = 'test-org/test-repo'
    const sanitizedRepo = 'test-org-test-repo'
    const version = '1.2.3'
    const repoId = '123'
    const ownerId = '456'
    const sourceCommit = 'abc'
    const tarFile: FileMetadata = {
      path: '/test/test/test.tar.gz',
      sha256: 'tarSha',
      size: 123
    }
    const zipFile: FileMetadata = {
      path: '/test/test/test.zip',
      sha256: 'zipSha',
      size: 456
    }

    const expectedJSON = `{
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "artifactType": "application/vnd.github.actions.package.v1+json",
            "config": {
                "mediaType":"application/vnd.oci.empty.v1+json",
                "size":2,
                "digest":"sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
            },
            "layers":[
                {
                  "mediaType":"application/vnd.oci.empty.v1+json",
                  "size":2,
                  "digest":"sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
                },
                {
                    "mediaType":"application/vnd.github.actions.package.layer.v1.tar+gzip",
                    "size":${tarFile.size},
                    "digest":"${tarFile.sha256}",
                    "annotations":{
                        "org.opencontainers.image.title":"${sanitizedRepo}_${version}.tar.gz"
                    }
                },
                {
                    "mediaType":"application/vnd.github.actions.package.layer.v1.zip",
                    "size":${zipFile.size},
                    "digest":"${zipFile.sha256}",
                    "annotations":{
                        "org.opencontainers.image.title":"${sanitizedRepo}_${version}.zip"
                    }
                }
            ],
            "annotations":{
                "org.opencontainers.image.created":"${date.toISOString()}",
                "action.tar.gz.digest":"${tarFile.sha256}",
                "action.zip.digest":"${zipFile.sha256}",
                "com.github.package.type":"actions_oci_pkg",
                "com.github.package.version":"1.2.3",
                "com.github.source.repo.id":"123",
                "com.github.source.repo.owner.id":"456",
                "com.github.source.commit":"abc"
            }
        }`

    const manifest = createActionPackageManifest(
      {
        path: 'test.tar.gz',
        size: tarFile.size,
        sha256: tarFile.sha256
      },
      {
        path: 'test.zip',
        size: zipFile.size,
        sha256: zipFile.sha256
      },
      repo,
      repoId,
      ownerId,
      sourceCommit,
      version,
      date
    )

    const manifestJSON = JSON.stringify(manifest)
    expect(manifestJSON).toEqual(expectedJSON.replace(/\s/g, ''))
  })
})
