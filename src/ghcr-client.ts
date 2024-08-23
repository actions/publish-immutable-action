import * as core from '@actions/core'
import * as ociContainer from './oci-container'

export async function uploadOCIImageManifest(
  token: string,
  registry: URL,
  repository: string,
  manifest: ociContainer.OCIImageManifest,
  blobs: Map<string, Buffer>,
  tag?: string
): Promise<string> {
  const b64Token = Buffer.from(token).toString('base64')
  const manifestSHA = ociContainer.sha256Digest(manifest)

  if (tag) {
    core.info(
      `Uploading manifest ${manifestSHA} with tag ${tag} to ${repository}.`
    )
  } else {
    core.info(`Uploading manifest ${manifestSHA} to ${repository}.`)
  }

  const layerUploads: Promise<void>[] = manifest.layers.map(async layer => {
    const blob = blobs.get(layer.digest)
    if (!blob) {
      throw new Error(`Blob for layer ${layer.digest} not found`)
    }
    return uploadLayer(layer, blob, registry, repository, b64Token)
  })

  await Promise.all(layerUploads)

  const publishedDigest = await uploadManifest(
    JSON.stringify(manifest),
    manifest.mediaType,
    registry,
    repository,
    tag || manifestSHA,
    b64Token
  )

  if (publishedDigest !== manifestSHA) {
    throw new Error(
      `Digest mismatch. Expected ${manifestSHA}, got ${publishedDigest}.`
    )
  }

  return manifestSHA
}

export async function uploadOCIIndexManifest(
  token: string,
  registry: URL,
  repository: string,
  manifest: ociContainer.OCIIndexManifest,
  tag: string
): Promise<string> {
  const b64Token = Buffer.from(token).toString('base64')
  const manifestSHA = ociContainer.sha256Digest(manifest)

  core.info(
    `Uploading index manifest ${manifestSHA} with tag ${tag} to ${repository}.`
  )

  const publishedDigest = await uploadManifest(
    JSON.stringify(manifest),
    manifest.mediaType,
    registry,
    repository,
    tag,
    b64Token
  )

  if (publishedDigest !== manifestSHA) {
    throw new Error(
      `Digest mismatch. Expected ${manifestSHA}, got ${publishedDigest}.`
    )
  }

  return manifestSHA
}

async function uploadLayer(
  layer: ociContainer.Descriptor,
  data: Buffer,
  registryURL: URL,
  repository: string,
  b64Token: string
): Promise<void> {
  const checkExistsResponse = await fetchWithDebug(
    checkBlobEndpoint(registryURL, repository, layer.digest),
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
      await errorMessageForFailedRequest(
        `check blob (${layer.digest}) exists`,
        checkExistsResponse
      )
    )
  }

  core.info(`Uploading layer ${layer.digest}.`)

  const initiateUploadBlobURL = uploadBlobEndpoint(registryURL, repository)

  const initiateUploadResponse = await fetchWithDebug(initiateUploadBlobURL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${b64Token}`
    },
    body: JSON.stringify(layer)
  })

  if (initiateUploadResponse.status !== 202) {
    throw new Error(
      await errorMessageForFailedRequest(
        `initiate layer upload`,
        initiateUploadResponse
      )
    )
  }

  const locationResponseHeader = initiateUploadResponse.headers.get('location')
  if (locationResponseHeader === undefined) {
    throw new Error(
      `No location header in response from upload post ${initiateUploadBlobURL} for layer ${layer.digest}`
    )
  }

  const pathname = `${locationResponseHeader}?digest=${layer.digest}`
  const uploadBlobUrl = new URL(pathname, registryURL).toString()

  const putResponse = await fetchWithDebug(uploadBlobUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${b64Token}`,
      'Content-Type': 'application/octet-stream',
      'Accept-Encoding': 'gzip',
      'Content-Length': layer.size.toString()
    },
    body: data
  })

  if (putResponse.status !== 201) {
    throw new Error(
      await errorMessageForFailedRequest(
        `layer (${layer.digest}) upload`,
        putResponse
      )
    )
  }
}

// Uploads the manifest and returns the digest returned by GHCR
async function uploadManifest(
  manifestJSON: string,
  manifestMediaType: string,
  registry: URL,
  repository: string,
  version: string,
  b64Token: string
): Promise<string> {
  const manifestUrl = manifestEndpoint(registry, repository, version)

  core.info(`Uploading manifest to ${manifestUrl}.`)

  const putResponse = await fetchWithDebug(manifestUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${b64Token}`,
      'Content-Type': manifestMediaType
    },
    body: manifestJSON
  })

  if (putResponse.status !== 201) {
    throw new Error(
      await errorMessageForFailedRequest(`manifest upload`, putResponse)
    )
  }

  const digestResponseHeader = putResponse.headers.get('docker-content-digest')
  if (digestResponseHeader === undefined || digestResponseHeader === null) {
    throw new Error(
      `No digest header in response from PUT manifest ${manifestUrl}`
    )
  }

  return digestResponseHeader
}

interface ghcrError {
  code: string
  message: string
}

// Generate an error message for a failed HTTP request
async function errorMessageForFailedRequest(
  requestDescription: string,
  response: Response
): Promise<string> {
  const bodyText = await response.text()

  // Try to parse the body as JSON and extract the expected fields returned from GHCR
  // Expected format: { "errors": [{"code": "BAD_REQUEST", "message": "Something went wrong."}] }
  // If the body does not match the expected format, just return the whole response body
  let errorString = `Response Body: ${bodyText}.`

  try {
    const body = JSON.parse(bodyText)
    const errors = body.errors

    if (
      Array.isArray(errors) &&
      errors.length > 0 &&
      errors.every(isGHCRError)
    ) {
      const errorMessages = errors.map((error: ghcrError) => {
        return `${error.code} - ${error.message}`
      })
      errorString = `Errors: ${errorMessages.join(', ')}`
    }
  } catch (error) {
    // Ignore error
  }

  return `Unexpected ${response.status} ${response.statusText} response from ${requestDescription}. ${errorString}`
}

// Runtime checks that parsed JSON object is in the expected format
// {"code": "BAD_REQUEST", "message": "Something went wrong."}
function isGHCRError(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    typeof (obj as { code: unknown }).code === 'string' &&
    'message' in obj &&
    typeof (obj as { message: unknown }).message === 'string'
  )
}

function checkBlobEndpoint(
  registry: URL,
  repository: string,
  digest: string
): string {
  return new URL(`v2/${repository}/blobs/${digest}`, registry).toString()
}

function uploadBlobEndpoint(registry: URL, repository: string): string {
  return new URL(`v2/${repository}/blobs/uploads/`, registry).toString()
}

function manifestEndpoint(
  registry: URL,
  repository: string,
  version: string
): string {
  return new URL(`v2/${repository}/manifests/${version}`, registry).toString()
}

// TODO: Add retries with backoff
const fetchWithDebug = async (
  url: string,
  config: RequestInit = {}
): Promise<Response> => {
  core.debug(`Request from ${url} with config: ${JSON.stringify(config)}`)
  try {
    const response = await fetch(url, config)
    core.debug(`Response with ${JSON.stringify(response)}`)
    return response
  } catch (error) {
    core.debug(`Error with ${error}`)
    throw error
  }
}
