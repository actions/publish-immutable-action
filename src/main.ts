import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fsHelper from './fs-helper'
import * as ociContainer from './oci-container'
import * as ghcr from './ghcr-client'
import semver from 'semver'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const tmpDirs: string[] = []

  try {
    const whoToGreet = core.getInput('who-to-greet', { required: true })
    core.info(`Hello, ${whoToGreet}!`)
    const token2 = core.getInput('token', { required: true })
    core.info(`Hello, ${token2}!`)

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
      // TODO: We may want to limit semvers to only x.x.x, without the pre-release tags, but for now we'll allow them.
      core.setFailed(
        `${releaseTag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`
      )
      return
    }

    // Gather & validate user inputs
    const token: string = core.getInput('token')

    console.log(
      `Official url: ${
        process.env.GITHUB_API_URL + '/packages/container-registry-url'
      }`
    )
    //const response = await fetch(
    //  process.env.GITHUB_API_URL + '/packages/container-registry-url'
    //)
    const response = await fetch(
      'http://echo.jsontest.com/url/https:ghcr.io' // for testing locally. Remove the slashes, they will be reintroduced when forming the URL object below
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch status page: ${response.statusText}`)
    }
    const data = await response.json()
    const registryURL: URL = new URL(data.url)
    console.log(`registryURL (supplied): ${core.getInput('registry')}`) // TODO: get rid of the `registry` input
    console.log(`registryURL (from URL): ${registryURL}`)

    // Paths to be included in the OCI image
    const paths: string[] = core.getInput('path').split(' ')
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

    // TODO: We might need to do some attestation stuff here, but unsure how to integrate it yet.
    // We might need to return the manifest JSON from the Action and link it to another action,
    // or we might be able to make an API call here. It's unclear at this point.
    core.setOutput('package-manifest', JSON.stringify(manifest))
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
