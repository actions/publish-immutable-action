import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fsHelper from './fs-helper'
import * as ociContainer from './oci-container'
import * as ghcr from './ghcr-client'
import semver from 'semver'
import crypto from 'crypto'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(pathInput: string): Promise<void> {
  const tmpDirs: string[] = []

  try {
    // Parse and validate Actions execution context, including the repository name, release name and event type
    const repository: string = process.env.GITHUB_REPOSITORY || ''

    if (repository === '') {
      core.setFailed(`Could not find Repository.`)
      return
    }
    if (github.context.eventName !== 'release') {
      core.setFailed('Please ensure you have the workflow trigger as release.')
      return
    }
    const releaseId: string = github.context.payload.release.id
    const releaseTag: string = github.context.payload.release.tag_name
    // Strip any leading 'v' from the tag in case the release format is e.g. 'v1.0.0' as recommended by GitHub docs
    // https://docs.github.com/en/actions/creating-actions/releasing-and-maintaining-actions
    const targetVersion = semver.parse(releaseTag.replace(/^v/, ''))
    if (!targetVersion) {
      core.setFailed(
        `${releaseTag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`
      )
      return
    }

    const token: string = process.env.TOKEN!

    const response = await fetch(
      process.env.GITHUB_API_URL + '/packages/container-registry-url'
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch status page: ${response.statusText}`)
    }
    const data = await response.json()
    const registryURL: URL = new URL(data.url)
    console.log(`Container registry URL: ${registryURL}`)

    // Gather & validate user input
    // Paths to be included in the OCI image
    // const paths: string[] = core.getInput('path').split(' ')
    const paths: string[] = pathInput.split(' ')
    let path = ''

    if (paths.length === 1 && fsHelper.isDirectory(paths[0])) {
      // If the path is a single directory, we can skip the bundling step
      path = paths[0]
    } else {
      // Otherwise, we need to bundle the files & folders into a temporary directory
      const bundleDir = fsHelper.createTempDir()
      tmpDirs.push(bundleDir)
      path = fsHelper.bundleFilesintoDirectory(paths, bundleDir)
    }

    if (!fsHelper.isActionRepo(path)) {
      core.setFailed(
        'action.y(a)ml not found. Action packages can be created only for action repositories.'
      )
      return
    }

    // Create a temporary directory to store the archives
    const archiveDir = fsHelper.createTempDir()
    tmpDirs.push(archiveDir)

    const archives = await fsHelper.createArchives(path, archiveDir)

    const manifest = ociContainer.createActionPackageManifest(
      archives.tarFile,
      archives.zipFile,
      repository,
      targetVersion.raw,
      new Date()
    )

    // Generate SHA-256 hash of the manifest
    const manifestSHA = crypto.createHash('sha256')
    const manifestHash = manifestSHA
      .update(JSON.stringify(manifest))
      .digest('hex')

    const packageURL = await ghcr.publishOCIArtifact(
      token,
      registryURL,
      repository,
      releaseId.toString(),
      targetVersion.raw,
      archives.zipFile,
      archives.tarFile,
      manifest,
      true
    )

    core.setOutput('package-url', packageURL.toString())
    core.setOutput('package-manifest', JSON.stringify(manifest))
    core.setOutput('package-manifest-sha', `sha256:${manifestHash}`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    // if (error instanceof Error) core.setFailed(error.message)
  } finally {
    // Clean up any temporary directories that exist
    for (const tmpDir of tmpDirs) {
      if (tmpDir !== '') {
        fsHelper.removeDir(tmpDir)
      }
    }
  }
}
