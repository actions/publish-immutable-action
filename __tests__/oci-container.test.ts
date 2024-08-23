import {
  createActionPackageManifest,
  sha256Digest,
  sizeInBytes,
  OCIImageManifest,
  createSigstoreAttestationManifest,
  OCIIndexManifest,
  createReferrerTagManifest
} from '../src/oci-container'
import { FileMetadata } from '../src/fs-helper'

const createdTimestamp = '2021-01-01T00:00:00.000Z'

describe('sha256Digest', () => {
  it('calculates the SHA256 digest of the provided manifest', () => {
    const { manifest } = testActionPackageManifest()
    const digest = sha256Digest(manifest)
    const expectedDigest =
      'sha256:1af9bf993bf068a51fbb54822471ab7507b07c553bcac09a7c91328740d8ed69'

    expect(digest).toEqual(expectedDigest)
  })
})

describe('size', () => {
  it('returns the total size of the provided manifest', () => {
    const { manifest } = testActionPackageManifest()
    const size = sizeInBytes(manifest)
    expect(size).toBe(991)
  })
})

describe('createActionPackageManifest', () => {
  it('creates a manifest containing the provided information', () => {
    const { manifest, zipFile, tarFile } = testActionPackageManifest()

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
                    "mediaType":"application/vnd.github.actions.package.layer.v1.tar+gzip",
                    "size":${tarFile.size},
                    "digest":"${tarFile.sha256}",
                    "annotations":{
                        "org.opencontainers.image.title":"test-org-test-repo_1.2.3.tar.gz"
                    }
                },
                {
                    "mediaType":"application/vnd.github.actions.package.layer.v1.zip",
                    "size":${zipFile.size},
                    "digest":"${zipFile.sha256}",
                    "annotations":{
                        "org.opencontainers.image.title":"test-org-test-repo_1.2.3.zip"
                    }
                }
            ],
            "annotations":{
                "org.opencontainers.image.created":"${createdTimestamp}",
                "action.tar.gz.digest":"${tarFile.sha256}",
                "action.zip.digest":"${zipFile.sha256}",
                "com.github.package.type":"actions_oci_pkg",
                "com.github.package.version":"1.2.3",
                "com.github.source.repo.id":"123",
                "com.github.source.repo.owner.id":"456",
                "com.github.source.commit":"abc"
            }
        }`

    const manifestJSON = JSON.stringify(manifest)
    expect(manifestJSON).toEqual(expectedJSON.replace(/\s/g, ''))
  })

  it('uses the current time if no created date is provided', () => {
    const { manifest } = testActionPackageManifest(false)
    expect(
      manifest.annotations['org.opencontainers.image.created']
    ).toBeDefined()
  })
})

describe('createSigstoreAttestationManifest', () => {
  it('creates a manifest containing the provided information', () => {
    const manifest = testAttestationManifest()

    const expectedJSON = `{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "artifactType": "application/vnd.dev.sigstore.bundle.v0.3+json",
  "config": {
    "mediaType": "application/vnd.oci.empty.v1+json",
    "size": 2,
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
  },
  "layers": [
    {
      "mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
      "size": 10,
      "digest": "bundleDigest"
    }
  ],
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "size": 100,
    "digest": "subjectDigest"
  },
  "annotations": {
    "dev.sigstore.bundle.content": "dsse-envelope",
    "dev.sigstore.bundle.predicateType": "https://slsa.dev/provenance/v1",
    "com.github.package.type": "actions_oci_pkg_attestation",
    "org.opencontainers.image.created": "2021-01-01T00:00:00.000Z"
  }
}
`

    const manifestJSON = JSON.stringify(manifest)

    expect(manifestJSON).toEqual(expectedJSON.replace(/\s/g, ''))
  })

  it('uses the current time if no created date is provided', () => {
    const manifest = testAttestationManifest(false)
    expect(
      manifest.annotations['org.opencontainers.image.created']
    ).toBeDefined()
  })
})

describe('createReferrerIndexManifest', () => {
  it('creates a manifest containing the provided information', () => {
    const manifest = testReferrerIndexManifest()

    const expectedJSON = `
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "artifactType": "application/vnd.dev.sigstore.bundle.v0.3+json",
      "size": 100,
      "digest": "attDigest",
      "annotations": {
        "com.github.package.type": "actions_oci_pkg_attestation",
        "org.opencontainers.image.created": "2021-01-01T00:00:00.000Z",
        "dev.sigstore.bundle.content": "dsse-envelope",
        "dev.sigstore.bundle.predicateType": "https://slsa.dev/provenance/v1"
      }
    }
  ],
  "annotations": {
    "com.github.package.type": "actions_oci_pkg_referrer_tag",
    "org.opencontainers.image.created": "2021-01-01T00:00:00.000Z"
  }
}
            `

    const manifestJSON = JSON.stringify(manifest)

    expect(manifestJSON).toEqual(expectedJSON.replace(/\s/g, ''))
  })

  it('uses the current time if no created date is provided', () => {
    const manifest = testReferrerIndexManifest(false)
    expect(
      manifest.annotations['org.opencontainers.image.created']
    ).toBeDefined()
  })
})

function testActionPackageManifest(setCreated = true): {
  manifest: OCIImageManifest
  tarFile: FileMetadata
  zipFile: FileMetadata
} {
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
    setCreated ? date : undefined
  )

  return {
    manifest,
    tarFile,
    zipFile
  }
}

function testAttestationManifest(setCreated = true): OCIImageManifest {
  const date = new Date(createdTimestamp)
  return createSigstoreAttestationManifest(
    10,
    'bundleDigest',
    100,
    'subjectDigest',
    setCreated ? date : undefined
  )
}

function testReferrerIndexManifest(setCreated = true): OCIIndexManifest {
  const date = new Date(createdTimestamp)
  return createReferrerTagManifest(
    'attDigest',
    100,
    date,
    setCreated ? date : undefined
  )
}
