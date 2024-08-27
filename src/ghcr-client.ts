import * as core from '@actions/core'
import * as ociContainer from './oci-container'

const defaultRetries = 5
const defaultBackoff = 1000
const retryableStatusCodes = [408, 429, 500, 502, 503, 504]

export interface RetryOptions {
  retries: number
  backoff: number
}

export class Client {
  private _b64Token: string
  private _registry: URL
  private _retryOptions: RetryOptions

  constructor(
    token: string,
    registry: URL,
    retryOptions: RetryOptions = {
      retries: defaultRetries,
      backoff: defaultBackoff
    }
  ) {
    this._b64Token = Buffer.from(token).toString('base64')
    this._registry = registry
    this._retryOptions = retryOptions
  }

  async uploadOCIImageManifest(
    repository: string,
    manifest: ociContainer.OCIImageManifest,
    blobs: Map<string, Buffer>,
    tag?: string
  ): Promise<string> {
    const manifestSHA = ociContainer.sha256Digest(manifest)

    if (tag) {
      core.info(
        `Uploading manifest ${manifestSHA} with tag ${tag} to ${repository}.`
      )
    } else {
      core.info(`Uploading manifest ${manifestSHA} to ${repository}.`)
    }

    // We must also upload the config layer
    const layersToUpload = manifest.layers.concat(manifest.config)

    const layerUploads: Promise<void>[] = layersToUpload.map(async layer => {
      const blob = blobs.get(layer.digest)
      if (!blob) {
        throw new Error(`Blob for layer ${layer.digest} not found`)
      }
      return this.uploadLayer(layer, blob, repository)
    })

    await Promise.all(layerUploads)

    const publishedDigest = await this.uploadManifest(
      JSON.stringify(manifest),
      manifest.mediaType,
      repository,
      tag || manifestSHA
    )

    if (publishedDigest !== manifestSHA) {
      throw new Error(
        `Digest mismatch. Expected ${manifestSHA}, got ${publishedDigest}.`
      )
    }

    return manifestSHA
  }

  async uploadOCIIndexManifest(
    repository: string,
    manifest: ociContainer.OCIIndexManifest,
    tag: string
  ): Promise<string> {
    const manifestSHA = ociContainer.sha256Digest(manifest)

    core.info(
      `Uploading index manifest ${manifestSHA} with tag ${tag} to ${repository}.`
    )

    const publishedDigest = await this.uploadManifest(
      JSON.stringify(manifest),
      manifest.mediaType,
      repository,
      tag
    )

    if (publishedDigest !== manifestSHA) {
      throw new Error(
        `Digest mismatch. Expected ${manifestSHA}, got ${publishedDigest}.`
      )
    }

    return manifestSHA
  }

  private async uploadLayer(
    layer: ociContainer.Descriptor,
    data: Buffer,
    repository: string
  ): Promise<void> {
    const checkExistsResponse = await this.fetchWithRetries(
      this.checkBlobEndpoint(repository, layer.digest),
      {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${this._b64Token}`
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

    const initiateUploadBlobURL = this.uploadBlobEndpoint(repository)

    const initiateUploadResponse = await this.fetchWithRetries(
      initiateUploadBlobURL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._b64Token}`
        },
        body: JSON.stringify(layer)
      }
    )

    if (initiateUploadResponse.status !== 202) {
      throw new Error(
        await errorMessageForFailedRequest(
          `initiate layer upload`,
          initiateUploadResponse
        )
      )
    }

    const locationResponseHeader =
      initiateUploadResponse.headers.get('location')
    if (locationResponseHeader === undefined) {
      throw new Error(
        `No location header in response from upload post ${initiateUploadBlobURL} for layer ${layer.digest}`
      )
    }

    const pathname = `${locationResponseHeader}?digest=${layer.digest}`
    const uploadBlobUrl = new URL(pathname, this._registry).toString()

    const putResponse = await this.fetchWithRetries(uploadBlobUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this._b64Token}`,
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
  private async uploadManifest(
    manifestJSON: string,
    manifestMediaType: string,
    repository: string,
    version: string
  ): Promise<string> {
    const manifestUrl = this.manifestEndpoint(repository, version)

    core.info(`Uploading manifest to ${manifestUrl}.`)

    const putResponse = await this.fetchWithRetries(manifestUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this._b64Token}`,
        'Content-Type': manifestMediaType
      },
      body: manifestJSON
    })

    if (putResponse.status !== 201) {
      throw new Error(
        await errorMessageForFailedRequest(`manifest upload`, putResponse)
      )
    }

    const digestResponseHeader =
      putResponse.headers.get('docker-content-digest') || ''

    return digestResponseHeader
  }

  private checkBlobEndpoint(repository: string, digest: string): string {
    return new URL(
      `v2/${repository}/blobs/${digest}`,
      this._registry
    ).toString()
  }

  private uploadBlobEndpoint(repository: string): string {
    return new URL(`v2/${repository}/blobs/uploads/`, this._registry).toString()
  }

  private manifestEndpoint(repository: string, version: string): string {
    return new URL(
      `v2/${repository}/manifests/${version}`,
      this._registry
    ).toString()
  }

  private async fetchWithDebug(
    url: string,
    config: RequestInit = {}
  ): Promise<Response> {
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

  private async fetchWithRetries(
    url: string,
    config: RequestInit = {}
  ): Promise<Response> {
    const allowedAttempts = this._retryOptions.retries + 1 // Initial attempt + retries

    for (
      let attemptNumber = 1;
      attemptNumber <= allowedAttempts;
      attemptNumber++
    ) {
      let backoff = this._retryOptions.backoff

      try {
        const response = await this.fetchWithDebug(url, config)

        // If this is the last attempt, just return it
        if (attemptNumber === allowedAttempts) {
          return response
        }

        // If the response is retryable, backoff and retry
        if (retryableStatusCodes.includes(response.status)) {
          const retryAfter = response.headers.get('retry-after')
          if (retryAfter) {
            backoff = parseInt(retryAfter) * 1000 // convert to ms
          }

          core.info(
            `Received ${response.status} response. Retrying after ${backoff}ms...`
          )
          await new Promise(resolve => setTimeout(resolve, backoff))
          continue
        }

        // Otherwise, just return the response
        return response
      } catch (error) {
        // If this is the last attempt, throw the error
        if (attemptNumber === allowedAttempts) {
          throw error
        }

        core.info(`Encountered error: ${error}. Retrying after ${backoff}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoff))
      }
    }

    // Should be unreachable
    throw new Error('Exhausted retries without a successful response')
  }
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
