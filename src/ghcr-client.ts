import * as core from '@actions/core'
import { FileMetadata } from './fs-helper'
import * as ociContainer from './oci-container'
import * as fsHelper from './fs-helper'

let showDebugLog = false

// Publish the OCI artifact and return the URL where it can be downloaded
export async function publishOCIArtifact(
  token: string,
  registry: URL,
  repository: string,
  semver: string,
  zipFile: FileMetadata,
  tarFile: FileMetadata,
  manifest: ociContainer.Manifest,
  debugRequests = false
): Promise<{ packageURL: URL; manifestDigest: string }> {
  if (debugRequests) {
    showDebugLog = true
  }

  const b64Token = Buffer.from(token).toString('base64')

  const checkBlobEndpoint = new URL(
    `v2/${repository}/blobs/`,
    registry
  ).toString()
  const uploadBlobEndpoint = new URL(
    `v2/${repository}/blobs/uploads/`,
    registry
  ).toString()
  const manifestEndpoint = new URL(
    `v2/${repository}/manifests/${semver}`,
    registry
  ).toString()

  core.info(
    `Creating GHCR package for release with semver:${semver} with path:"${zipFile.path}" and "${tarFile.path}".`
  )

  const layerUploads: Promise<void>[] = manifest.layers.map(async layer => {
    switch (layer.mediaType) {
      case 'application/vnd.github.actions.package.layer.v1.tar+gzip':
        return uploadLayer(
          layer,
          tarFile,
          registry,
          checkBlobEndpoint,
          uploadBlobEndpoint,
          b64Token
        )
      case 'application/vnd.github.actions.package.layer.v1.zip':
        return uploadLayer(
          layer,
          zipFile,
          registry,
          checkBlobEndpoint,
          uploadBlobEndpoint,
          b64Token
        )
      case 'application/vnd.github.actions.package.config.v1+json':
        return uploadLayer(
          layer,
          { path: '', size: 0, sha256: layer.digest },
          registry,
          checkBlobEndpoint,
          uploadBlobEndpoint,
          b64Token
        )
      default:
        throw new Error(`Unknown media type ${layer.mediaType}`)
    }
  })

  await Promise.all(layerUploads)

  const digest = await uploadManifest(
    JSON.stringify(manifest),
    manifestEndpoint,
    b64Token
  )

  return {
    packageURL: new URL(`${repository}:${semver}`, registry),
    manifestDigest: digest
  }
}

async function uploadLayer(
  layer: ociContainer.Layer,
  file: FileMetadata,
  registryURL: URL,
  checkBlobEndpoint: string,
  uploadBlobEndpoint: string,
  b64Token: string
): Promise<void> {
  const checkExistsResponse = await fetchWithDebug(
    checkBlobEndpoint + layer.digest,
    {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${b64Token}`
      }
    }
  )

  if (
    checkExistsResponse.status === 200 ||
    checkExistsResponse.status === 202
  ) {
    core.info(`Layer ${layer.digest} already exists. Skipping upload.`)
    return
  }

  if (checkExistsResponse.status !== 404) {
    throw new Error(
      `Unexpected response from blob check for layer ${layer.digest}: ${checkExistsResponse.status} ${checkExistsResponse.statusText}`
    )
  }

  core.info(`Uploading layer ${layer.digest}.`)

  const initiateUploadResponse = await fetchWithDebug(uploadBlobEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${b64Token}`
    },
    body: JSON.stringify(layer)
  })

  if (initiateUploadResponse.status !== 202) {
    core.error(
      `Unexpected response from upload post ${uploadBlobEndpoint}: ${initiateUploadResponse.status}`
    )
    throw new Error(
      `Unexpected response from POST upload ${initiateUploadResponse.status}`
    )
  }

  const locationResponseHeader = initiateUploadResponse.headers.get('location')
  if (locationResponseHeader === undefined) {
    throw new Error(
      `No location header in response from upload post ${uploadBlobEndpoint} for layer ${layer.digest}`
    )
  }

  const pathname = `${locationResponseHeader}?digest=${layer.digest}`
  const uploadBlobUrl = new URL(pathname, registryURL).toString()

  // TODO: must we handle the empty config layer? Maybe we can just skip calling this at all
  let data: Buffer
  if (file.size === 0) {
    data = Buffer.alloc(0)
  } else {
    data = fsHelper.readFileContents(file.path)
  }

  const putResponse = await fetchWithDebug(uploadBlobUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${b64Token}`,
      'Content-Type': 'application/octet-stream',
      'Accept-Encoding': 'gzip', // TODO: What about for the config layer?
      'Content-Length': layer.size.toString()
    },
    body: data
  })

  if (putResponse.status !== 201) {
    throw new Error(
      `Unexpected response from PUT upload ${putResponse.status} for layer ${layer.digest}`
    )
  }
}

// Uploads the manifest and returns the digest returned by GHCR
async function uploadManifest(
  manifestJSON: string,
  manifestEndpoint: string,
  b64Token: string
): Promise<string> {
  core.info(`Uploading manifest to ${manifestEndpoint}.`)

  const putResponse = await fetchWithDebug(manifestEndpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${b64Token}`,
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
    },
    body: manifestJSON
  })

  if (putResponse.status !== 201) {
    throw new Error(
      `Unexpected response from PUT manifest ${putResponse.status}`
    )
  }

  const digestResponseHeader = putResponse.headers.get('docker-content-digest')
  if (digestResponseHeader === undefined || digestResponseHeader === null) {
    throw new Error(
      `No digest header in response from PUT manifest ${manifestEndpoint}`
    )
  }

  return digestResponseHeader
}

const fetchWithDebug = async (
  url: string,
  config: RequestInit = {}
): Promise<Response> => {
  if (showDebugLog) {
    core.debug(`Request with ${JSON.stringify(config)}`)
  }
  try {
    const response = await fetch(url, config)
    if (showDebugLog) {
      core.debug(`Response with ${JSON.stringify(response)}`)
    }
    return response
  } catch (error) {
    if (showDebugLog) {
      core.debug(`Error with ${error}`)
    }
    throw error
  }
}
