import { FileMetadata } from './fs-helper'
import * as crypto from 'crypto'

const imageIndexMediaType = 'application/vnd.oci.image.index.v1+json'
const imageManifestMediaType = 'application/vnd.oci.image.manifest.v1+json'
const actionsPackageMediaType = 'application/vnd.github.actions.package.v1+json'
const actionsPackageTarLayerMediaType =
  'application/vnd.github.actions.package.layer.v1.tar+gzip'
const actionsPackageZipLayerMediaType =
  'application/vnd.github.actions.package.layer.v1.zip'
const sigstoreBundleMediaType = 'application/vnd.dev.sigstore.bundle.v0.3+json'

const actionPackageAnnotationValue = 'actions_oci_pkg'
const actionPackageAttestationAnnotationValue = 'actions_oci_pkg_attestation'
const actionPackageReferrerTagAnnotationValue = 'actions_oci_pkg_referrer_tag'

export const ociEmptyMediaType = 'application/vnd.oci.empty.v1+json'
export const emptyConfigSize = 2
export const emptyConfigSha =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'

export interface OCIImageManifest {
  schemaVersion: number
  mediaType: string
  artifactType: string
  config: Descriptor
  layers: Descriptor[]
  subject?: Descriptor
  annotations: { [key: string]: string }
}

export interface OCIIndexManifest {
  schemaVersion: number
  mediaType: string
  manifests: Descriptor[]
  annotations: { [key: string]: string }
}

export interface Descriptor {
  mediaType: string
  size: number
  digest: string
  artifactType?: string
  annotations?: { [key: string]: string }
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
  created: Date = new Date()
): OCIImageManifest {
  const configLayer = createConfigLayer()
  const sanitizedRepo = sanitizeRepository(repository)
  const tarLayer = createTarLayer(tarFile, sanitizedRepo, version)
  const zipLayer = createZipLayer(zipFile, sanitizedRepo, version)

  const manifest: OCIImageManifest = {
    schemaVersion: 2,
    mediaType: imageManifestMediaType,
    artifactType: actionsPackageMediaType,
    config: configLayer,
    layers: [configLayer, tarLayer, zipLayer],
    annotations: {
      'org.opencontainers.image.created': created.toISOString(),
      'action.tar.gz.digest': tarFile.sha256,
      'action.zip.digest': zipFile.sha256,
      'com.github.package.type': actionPackageAnnotationValue,
      'com.github.package.version': version,
      'com.github.source.repo.id': repoId,
      'com.github.source.repo.owner.id': ownerId,
      'com.github.source.commit': sourceCommit
    }
  }

  return manifest
}

export function createSigstoreAttestationManifest(
  bundleSize: number,
  bundleDigest: string,
  subjectSize: number,
  subjectDigest: string,
  created: Date = new Date()
): OCIImageManifest {
  const configLayer = createConfigLayer()

  const sigstoreAttestationLayer: Descriptor = {
    mediaType: sigstoreBundleMediaType,
    size: bundleSize,
    digest: bundleDigest
  }

  const subject: Descriptor = {
    mediaType: imageManifestMediaType,
    size: subjectSize,
    digest: subjectDigest
  }

  const manifest: OCIImageManifest = {
    schemaVersion: 2,
    mediaType: imageManifestMediaType,
    artifactType: sigstoreBundleMediaType,
    config: configLayer,
    layers: [sigstoreAttestationLayer],
    subject,

    annotations: {
      'dev.sigstore.bundle.content': 'dsse-envelope',
      'dev.sigstore.bundle.predicateType': 'https://slsa.dev/provenance/v1',
      'com.github.package.type': actionPackageAttestationAnnotationValue,
      'org.opencontainers.image.created': created.toISOString()
    }
  }

  return manifest
}

export function createReferrerTagManifest(
  attestationDigest: string,
  attestationSize: number,
  attestationCreated: Date,
  created: Date = new Date()
): OCIIndexManifest {
  const manifest: OCIIndexManifest = {
    schemaVersion: 2,
    mediaType: imageIndexMediaType,
    manifests: [
      {
        mediaType: imageManifestMediaType,
        artifactType: sigstoreBundleMediaType,
        size: attestationSize,
        digest: attestationDigest,
        annotations: {
          'com.github.package.type': actionPackageAttestationAnnotationValue,
          'org.opencontainers.image.created': attestationCreated.toISOString(),
          'dev.sigstore.bundle.content': 'dsse-envelope',
          'dev.sigstore.bundle.predicateType': 'https://slsa.dev/provenance/v1'
        }
      }
    ],
    annotations: {
      'com.github.package.type': actionPackageReferrerTagAnnotationValue,
      'org.opencontainers.image.created': created.toISOString()
    }
  }

  return manifest
}

// Calculate the SHA256 digest of a given manifest.
// This should match the digest which the GitHub container registry calculates for this manifest.
export function sha256Digest(
  manifest: OCIImageManifest | OCIIndexManifest
): string {
  const data = JSON.stringify(manifest)
  const buffer = Buffer.from(data, 'utf8')
  const hash = crypto.createHash('sha256')
  hash.update(buffer)
  const hexHash = hash.digest('hex')
  return `sha256:${hexHash}`
}

export function sizeInBytes(
  manifest: OCIImageManifest | OCIIndexManifest
): number {
  const data = JSON.stringify(manifest)
  return Buffer.byteLength(data, 'utf8')
}

function createConfigLayer(): Descriptor {
  const configLayer: Descriptor = {
    mediaType: ociEmptyMediaType,
    size: emptyConfigSize,
    digest: emptyConfigSha
  }

  return configLayer
}

function createZipLayer(
  zipFile: FileMetadata,
  repository: string,
  version: string
): Descriptor {
  const zipLayer: Descriptor = {
    mediaType: actionsPackageZipLayerMediaType,
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
): Descriptor {
  const tarLayer: Descriptor = {
    mediaType: actionsPackageTarLayerMediaType,
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
