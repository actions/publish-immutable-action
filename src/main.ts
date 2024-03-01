import * as core from '@actions/core'
import semver from 'semver'
import * as iaToolkit from '@immutable-actions/toolkit'
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

    const semverTag: semver.SemVer = parseSemverTagFromRef(options.ref)

    const stagedActionFilesDir = iaToolkit.createTempDir(
      options.runnerTempDir,
      'staging'
    )
    iaToolkit.stageActionFiles(options.workspaceDir, stagedActionFilesDir)

    const archiveDir = iaToolkit.createTempDir(
      options.runnerTempDir,
      'archives'
    )
    const archives = await iaToolkit.createArchives(
      stagedActionFilesDir,
      archiveDir
    )

    const manifest = iaToolkit.createActionPackageManifest(
      archives.tarFile,
      archives.zipFile,
      options.nameWithOwner,
      options.repositoryId,
      options.repositoryOwnerId,
      options.sha,
      semverTag.raw,
      new Date()
    )

    const { packageURL, manifestDigest } = await iaToolkit.publishOCIArtifact(
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
function parseSemverTagFromRef(ref: string): semver.SemVer {
  if (!ref.startsWith('refs/tags/')) {
    throw new Error(`The ref ${ref} is not a valid tag reference.`)
  }

  const rawTag = ref.replace(/^refs\/tags\//, '')
  const semverTag = semver.parse(rawTag)
  if (!semverTag) {
    throw new Error(
      `${rawTag} is not a valid semantic version tag, and so cannot be uploaded to the action package.`
    )
  }

  return semverTag
}

// Generate an attestation using the actions toolkit
// Subject name will contain the repo/package name and the tag name
async function generateAttestation(
  manifestDigest: string,
  semverTag: string,
  options: cfg.PublishActionOptions
): Promise<attest.Attestation> {
  const subjectName = `${options.nameWithOwner}_${semverTag}`
  const subjectDigest = removePrefix(manifestDigest, 'sha256:')

  return await attest.attestProvenance({
    subjectName,
    subjectDigest: { sha256: subjectDigest },
    token: options.token,
    skipWrite: false // TODO: Attestation storage is only supported for public repositories or repositories which belong to a GitHub Enterprise Cloud account
  })
}

function removePrefix(str: string, prefix: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length)
  }
  return str
}
