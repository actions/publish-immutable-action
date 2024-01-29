import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fsHelper from './fs-helper'
import * as ociContainer from './oci-container'
import * as ghcr from './ghcr-client'
import * as api from './api-client'
import semver from 'semver'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(pathInput: string): Promise<void> {
  const tmpDirs: string[] = []

  try {
    const repository: string = process.env.GITHUB_REPOSITORY || ''
    if (repository === '') {
      core.setFailed(`Could not find Repository.`)
      return
    }

    const token: string = process.env.TOKEN || ''
    const sourceCommit: string = process.env.GITHUB_SHA || ''
    if (token === '') {
      core.setFailed(`Could not find GITHUB_TOKEN.`)
      return
    }
    if (sourceCommit === '') {
      core.setFailed(`Could not find source commit.`)
      return
    }

    const semanticVersion = parseSourceSemanticVersion()

    // Create a temporary directory to stage files for packaging in archives
    const stagedActionFilesDir = fsHelper.createTempDir()
    tmpDirs.push(stagedActionFilesDir)
    fsHelper.stageActionFiles('.', stagedActionFilesDir)

    // Create a temporary directory to store the archives
    const archiveDir = fsHelper.createTempDir()
    tmpDirs.push(archiveDir)
    const archives = await fsHelper.createArchives(
      stagedActionFilesDir,
      archiveDir
    )

    const { repoId, ownerId } = await api.getRepositoryMetadata(
      repository,
      token
    )

    const manifest = ociContainer.createActionPackageManifest(
      archives.tarFile,
      archives.zipFile,
      repository,
      repoId,
      ownerId,
      sourceCommit,
      semanticVersion.raw,
      new Date()
    )

    const containerRegistryURL = await api.getContainerRegistryURL()
    console.log(`Container registry URL: ${containerRegistryURL}`)

    const { packageURL, manifestDigest } = await ghcr.publishOCIArtifact(
      token,
      containerRegistryURL,
      repository,
      semanticVersion.raw,
      archives.zipFile,
      archives.tarFile,
      manifest,
      true
    )

    core.setOutput('package-url', packageURL.toString())
    core.setOutput('package-manifest', JSON.stringify(manifest))
    core.setOutput('package-manifest-sha', `sha256:${manifestDigest}`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  } finally {
    // Clean up any temporary directories that exist
    for (const tmpDir of tmpDirs) {
      if (tmpDir !== '') {
        fsHelper.removeDir(tmpDir)
      }
    }
  }
}

// This action can be triggered by release events or tag push events.
// In each case, the source event should produce a Semantic Version compliant tag representing the code to be packaged.
function parseSourceSemanticVersion(): semver.SemVer {
  const event = github.context.eventName
  var semverTag = ''

  // Grab the raw tag
  if (event === 'release') semverTag = github.context.payload.release.tag_name
  else if (event === 'push' && github.context.ref.startsWith('refs/tags/')) {
    semverTag = github.context.ref.replace(/^refs\/tags\//, '')
  } else {
    throw new Error(
      `This action can only be triggered by release events or tag push events.`
    )
  }

  if (semverTag === '') {
    throw new Error(
      `Could not find a Semantic Version tag in the event payload.`
    )
  }

  const semanticVersion = semver.parse(semverTag.replace(/^v/, ''))
  if (!semanticVersion) {
    throw new Error(
      `${semverTag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`
    )
  }

  return semanticVersion
}
