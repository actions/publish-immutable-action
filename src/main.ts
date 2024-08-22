import * as core from '@actions/core'
import semver from 'semver'
import * as fsHelper from './fs-helper'
import * as ociContainer from './oci-container'
import * as ghcr from './ghcr-client'
import * as attest from '@actions/attest'
import * as cfg from './config'
import { attachArtifactToImage, Descriptor } from '@sigstore/oci'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const options: cfg.PublishActionOptions =
      await cfg.resolvePublishActionOptions()

    core.info(`Publishing action package version with options:`)
    core.info(cfg.serializeOptions(options))

    const semverTag: semver.SemVer = parseSemverTagFromRef(options)

    // Ensure the correct SHA is checked out for the tag we're parsing, otherwise the bundled content will be incorrect.
    await fsHelper.ensureTagAndRefCheckedOut(
      options.ref,
      options.sha,
      options.workspaceDir
    )

    const stagedActionFilesDir = fsHelper.createTempDir(
      options.runnerTempDir,
      'staging'
    )
    fsHelper.stageActionFiles(options.workspaceDir, stagedActionFilesDir)

    const archiveDir = fsHelper.createTempDir(options.runnerTempDir, 'archives')
    const archives = await fsHelper.createArchives(
      stagedActionFilesDir,
      archiveDir
    )

    const manifest = ociContainer.createActionPackageManifest(
      archives.tarFile,
      archives.zipFile,
      options.nameWithOwner,
      options.repositoryId,
      options.repositoryOwnerId,
      options.sha,
      semverTag.raw,
      new Date()
    )

    const manifestDigest = ociContainer.sha256Digest(manifest)

    // Attestations are not supported in GHES.
    if (!options.isEnterprise) {
      const attestation = await uploadAttestation(
        manifestDigest,
        semverTag.raw,
        options
      )
      if (attestation.digest !== undefined) {
        core.info(`Uploaded attestation ${attestation.digest}`)
        core.setOutput('attestation-manifest-sha', attestation.digest)
      }
      if (attestation.urls !== undefined && attestation.urls.length > 0) {
        core.info(`Attestation URL: ${attestation.digest}`)
        core.setOutput('attestation-url', attestation.urls[0])
      }
    }

    const { packageURL, publishedDigest } = await ghcr.publishOCIArtifact(
      options.token,
      options.containerRegistryUrl,
      options.nameWithOwner,
      semverTag.raw,
      archives.zipFile,
      archives.tarFile,
      manifest
    )

    if (manifestDigest !== publishedDigest) {
      throw new Error(
        `Unexpected digest returned for manifest. Expected ${manifestDigest}, got ${publishedDigest}`
      )
    }

    core.setOutput('package-url', packageURL.toString())
    core.setOutput('package-manifest', JSON.stringify(manifest))
    core.setOutput('package-manifest-sha', publishedDigest)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// This action can be triggered by any workflow that specifies a tag as its GITHUB_REF.
// This includes releases, creating or pushing tags, or workflow_dispatch.
// See https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#about-events-that-trigger-workflows.
function parseSemverTagFromRef(opts: cfg.PublishActionOptions): semver.SemVer {
  const ref = opts.ref

  if (!ref.startsWith('refs/tags/')) {
    throw new Error(`The ref ${ref} is not a valid tag reference.`)
  }

  const rawTag = ref.replace(/^refs\/tags\//, '')
  const semverTag = semver.parse(rawTag.replace(/^v/, ''))
  if (!semverTag) {
    throw new Error(
      `${rawTag} is not a valid semantic version tag, and so cannot be uploaded to the action package.`
    )
  }

  return semverTag
}

// Generate an attestation using the actions toolkit
// Subject name will contain the repo/package name and the tag name
async function uploadAttestation(
  manifestDigest: string,
  semverTag: string,
  options: cfg.PublishActionOptions
): Promise<Descriptor> {
  const OCI_TIMEOUT = 30000
  const OCI_RETRY = 3
  const PREDICATE_TYPE = 'https://slsa.dev/provenance/v1'

  const subjectName = `${options.nameWithOwner}@${semverTag}`
  const subjectDigest = removePrefix(manifestDigest, 'sha256:')

  core.info(`Generating attestation ${subjectName} for digest ${subjectDigest}`)

  const attestation = await attest.attestProvenance({
    subjectName,
    subjectDigest: { sha256: subjectDigest },
    token: options.token,
    sigstore: 'github',
    skipWrite: true // We will upload attestations to GHCR
  })

  // Upload the attestation to the GitHub Container Registry
  const credentials = { username: 'token', password: options.token }

  return await attachArtifactToImage({
    credentials,
    imageName: `${options.containerRegistryUrl.host}/${options.nameWithOwner}`,
    imageDigest: manifestDigest,
    artifact: Buffer.from(JSON.stringify(attestation.bundle)),
    mediaType: attestation.bundle.mediaType,
    annotations: {
      'dev.sigstore.bundle.content': 'dsse-envelope',
      'dev.sigstore.bundle.predicateType': PREDICATE_TYPE,
      'com.github.package.type': 'actions_oci_pkg_attestation'
    },
    fetchOpts: {
      timeout: OCI_TIMEOUT,
      retry: OCI_RETRY,
      proxy: undefined,
      noProxy: undefined
    }
  })
}

function removePrefix(str: string, prefix: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length)
  }
  return str
}
