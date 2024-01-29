import { FileMetadata } from './fs-helper'

export interface Manifest {
  schemaVersion: number
  mediaType: string
  artifactType: string
  config: Layer
  layers: Layer[]
  annotations: { [key: string]: string }
}

export interface Layer {
  mediaType: string
  size: number
  digest: string
  annotations: { [key: string]: string }
}

// Given a name and archive metadata, creates a manifest in the format expected by GHCR for an Actions Package.
export function createActionPackageManifest(
  tarFile: FileMetadata,
  zipFile: FileMetadata,
  repository: string,
  repoId: string,
  ownerId: string,
  sourceCommit: string,
  version: string,
  created: Date
): Manifest {
  const configLayer = createConfigLayer()
  const sanitizedRepo = sanitizeRepository(repository)
  const tarLayer = createTarLayer(tarFile, sanitizedRepo, version)
  const zipLayer = createZipLayer(zipFile, sanitizedRepo, version)

  const manifest: Manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    artifactType: 'application/vnd.github.actions.package.v1+json',
    config: configLayer,
    layers: [configLayer, tarLayer, zipLayer],
    annotations: {
      'org.opencontainers.image.created': created.toISOString(),
      'action.tar.gz.digest': tarFile.sha256,
      'action.zip.digest': zipFile.sha256,
      'com.github.package.type': 'actions_oci_pkg',
      'com.github.package.version': version,
      'com.github.source.repo.id': repoId,
      'com.github.source.repo.owner.id': ownerId,
      'com.github.source.commit': sourceCommit,
    }
  }

  return manifest
}

// TODO: is this ok hardcoded?
function createConfigLayer(): Layer {
  const configLayer: Layer = {
    mediaType: 'application/vnd.github.actions.package.config.v1+json',
    size: 0,
    digest:
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    annotations: {
      'org.opencontainers.image.title': 'config.json'
    }
  }

  return configLayer
}

function createZipLayer(
  zipFile: FileMetadata,
  repository: string,
  version: string
): Layer {
  const zipLayer: Layer = {
    mediaType: 'application/vnd.github.actions.package.layer.v1.zip',
    size: zipFile.size,
    digest: zipFile.sha256,
    annotations: {
      'org.opencontainers.image.title': `${repository}_${version}.zip`
    }
  }

  return zipLayer
}

function createTarLayer(
  tarFile: FileMetadata,
  repository: string,
  version: string
): Layer {
  const tarLayer: Layer = {
    mediaType: 'application/vnd.github.actions.package.layer.v1.tar+gzip',
    size: tarFile.size,
    digest: tarFile.sha256,
    annotations: {
      'org.opencontainers.image.title': `${repository}_${version}.tar.gz`
    }
  }

  return tarLayer
}

// Remove slashes so we can use the repository in a filename
// repository usually includes the namespace too, e.g. my-org/my-repo
function sanitizeRepository(repository: string): string {
  return repository.replace('/', '-')
}
