import * as core from '@actions/core'
import semver from 'semver'
import * as fsHelper from './fs-helper'
import * as ociContainer from './oci-container'
import * as ghcr from './ghcr-client'
import * as attest from '@actions/attest'
import * as cfg from './config'

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

    const semverTag: semver.SemVer = await parseSemverTagFromRef(options)

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

    const { packageURL, manifestDigest } = await ghcr.publishOCIArtifact(
      options.token,
      options.containerRegistryUrl,
      options.nameWithOwner,
      semverTag.raw,
      archives.zipFile,
      archives.tarFile,
      manifest
    )

    core.setOutput('package-url', packageURL.toString())
    core.setOutput('package-manifest', JSON.stringify(manifest))
    core.setOutput('package-manifest-sha', manifestDigest)

    // Attestations are not currently supported in GHES.
    if (!options.isEnterprise) {
      const attestation = await generateAttestation(
        manifestDigest,
        semverTag.raw,
        options
      )
      if (attestation.attestationID !== undefined) {
        core.setOutput('attestation-id', attestation.attestationID)
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// This action can be triggered by any workflow that specifies a tag as its GITHUB_REF.
// This includes releases, creating or pushing tags, or workflow_dispatch.
// See https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#about-events-that-trigger-workflows.
async function parseSemverTagFromRef(
  opts: cfg.PublishActionOptions
): Promise<semver.SemVer> {
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

  // Ensure the correct SHA is checked out for the tag we're parsing, otherwise the bundled content will be incorrect.
  await fsHelper.ensureCorrectShaCheckedOut(ref, opts.sha, opts.workspaceDir)

  return semverTag
}

// Generate an attestation using the actions toolkit
// Subject name will contain the repo/package name and the tag name
async function generateAttestation(
  manifestDigest: string,
  semverTag: string,
  options: cfg.PublishActionOptions
): Promise<attest.Attestation> {
  const subjectName = `${options.nameWithOwner}@${semverTag}`
  const subjectDigest = removePrefix(manifestDigest, 'sha256:')

  return await attest.attestProvenance({
    subjectName,
    subjectDigest: { sha256: subjectDigest },
    token: options.token,
    sigstore: 'github',
    // Attestation storage is only supported for public repositories or repositories which belong to a GitHub Enterprise Cloud account.
    // See: https://github.com/actions/toolkit/tree/main/packages/attest#storage
    // Since internal repos can only be owned by Enterprises, we'll use this visibility as a proxy for "owned by a GitHub Enterprise Cloud account."
    // See: https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/about-repositories#about-internal-repositories
    skipWrite: options.repositoryVisibility === 'private'
  })
}

function removePrefix(str: string, prefix: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length)
  }
  return str
}
