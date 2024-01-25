import { createActionPackageManifest } from '../src/oci-container'
import { FileMetadata } from '../src/fs-helper'

describe('createActionPackageManigest', () => {
  it('creates a manifest containing the provided information', () => {
    const date = new Date()
    const repo = 'test-org/test-repo'
    const sanitizedRepo = 'test-org-test-repo'
    const version = '1.0.0'
    const tarFile: FileMetadata = {
      path: '/test/test/test',
      sha256: '1234567890',
      size: 100
    }
    const zipFile: FileMetadata = {
      path: '/test/test/test',
      sha256: '1234567890',
      size: 100
    }

    const expectedJSON = `{
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "artifactType": "application/vnd.oci.image.manifest.v1+json",
            "config": {
                "mediaType": "application/vnd.github.actions.package.config.v1+json",
                "size": 0,
                "digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "annotations": {
                    "org.opencontainers.image.title":"config.json"
                }
            },
            "layers":[
                {
                    "mediaType":"application/vnd.github.actions.package.config.v1+json",
                    "size":0,
                    "digest":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    "annotations":{
                        "org.opencontainers.image.title":"config.json"
                    }
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
                "com.github.package.type":"actions_oci_pkg"
            }
        }`

    const manifest = createActionPackageManifest(
      {
        path: 'test.tar.gz',
        size: 100,
        sha256: '1234567890'
      },
      {
        path: 'test.zip',
        size: 100,
        sha256: '1234567890'
      },
      repo,
      version,
      date
    )

    const manifestJSON = JSON.stringify(manifest)
    expect(manifestJSON).toEqual(expectedJSON.replace(/\s/g, ''))
  })
})
