import * as fs from 'fs'
import fsExtra from 'fs-extra'
import * as path from 'path'
import * as tar from 'tar'
import * as archiver from 'archiver'
import * as crypto from 'crypto'
import * as simpleGit from 'simple-git'

export interface FileMetadata {
  path: string
  size: number
  sha256: string
}

// Simple convenience around creating subdirectories in the same base temporary directory
export function createTempDir(tmpDirPath: string, subDirName: string): string {
  const tempDir = path.join(tmpDirPath, subDirName)

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  return tempDir
}

// Creates both a tar.gz and zip archive of the given directory and returns the paths to both archives (stored in the provided target directory)
// as well as the size/sha256 hash of each file.
export async function createArchives(
  distPath: string,
  archiveTargetPath: string
): Promise<{ zipFile: FileMetadata; tarFile: FileMetadata }> {
  const zipPath = path.join(archiveTargetPath, `archive.zip`)
  const tarPath = path.join(archiveTargetPath, `archive.tar.gz`)

  const createZipPromise = new Promise<FileMetadata>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver.create('zip')

    output.on('error', (err: Error) => {
      reject(err)
    })

    archive.on('error', (err: Error) => {
      reject(err)
    })

    output.on('close', () => {
      resolve(fileMetadata(zipPath))
    })

    archive.pipe(output)
    archive.directory(distPath, 'action')
    archive.finalize()
  })

  const createTarPromise = new Promise<FileMetadata>((resolve, reject) => {
    tar
      .c(
        {
          file: tarPath,
          C: distPath,
          gzip: true,
          prefix: 'action'
        },
        ['.']
      )
      // eslint-disable-next-line github/no-then
      .catch(err => {
        reject(err)
      })
      // eslint-disable-next-line github/no-then
      .then(() => {
        resolve(fileMetadata(tarPath))
      })
  })

  const [zipFile, tarFile] = await Promise.all([
    createZipPromise,
    createTarPromise
  ])

  return { zipFile, tarFile }
}

export function isDirectory(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()
}

export function readFileContents(filePath: string): Buffer {
  return fs.readFileSync(filePath)
}

// Copy actions files from sourceDir to targetDir, excluding the .git folder.
export function stageActionFiles(actionDir: string, targetDir: string): void {
  fsExtra.copySync(actionDir, targetDir, {
    filter: (src: string) => {
      const basename = path.basename(src)

      // Filter out the .git folder.
      if (basename === '.git') {
        return false
      }

      return true
    }
  })
}

// Ensure the correct SHA is checked out for the tag by inspecting the git metadata in the workspace
// and comparing it to the information actions provided us.
// Provided ref should be in format refs/tags/<tagname>.
export async function ensureTagAndRefCheckedOut(
  tagRef: string,
  expectedSha: string,
  gitDir: string
): Promise<void> {
  if (!tagRef.startsWith('refs/tags/')) {
    throw new Error(`Tag ref provided is not in expected format.`)
  }

  const git: simpleGit.SimpleGit = simpleGit.simpleGit(gitDir)

  let tagCommitSha: string

  try {
    tagCommitSha = await git.raw(['rev-parse', '--verify', tagRef])
  } catch (err) {
    throw new Error(`Error retrieving commit associated with tag: ${err}`)
  }
  if (tagCommitSha.trim() !== expectedSha) {
    throw new Error(
      `The commit associated with the tag ${tagRef} does not match the SHA of the commit provided by the actions context.`
    )
  }

  let currentlyCheckedOutSha: string
  try {
    currentlyCheckedOutSha = await git.revparse(['HEAD'])
  } catch (err) {
    throw new Error(`Error validating checked out tag and ref: ${err}`)
  }
  if (currentlyCheckedOutSha.trim() !== expectedSha) {
    throw new Error(
      `The expected commit associated with the tag ${tagRef} is not checked out.`
    )
  }

  // Call git status to check for any changes in the working directory
  // This version of this action only supports uploading actions packages
  // which contain the same content as the repository at the appropriate source commit.
  let status: simpleGit.StatusResult
  try {
    status = await git.status()
  } catch (err) {
    throw new Error(`Error checking git status: ${err}`)
  }
  if (!status.isClean()) {
    throw new Error(
      `The working directory has uncommitted changes. Uploading modified code from the checked out repository is not supported by this action.`
    )
  }
}

// Converts a file path to a filemetadata object by querying the fs for relevant metadata.
async function fileMetadata(filePath: string): Promise<FileMetadata> {
  const stats = fs.statSync(filePath)
  const size = stats.size
  const hash = crypto.createHash('sha256')
  const fileStream = fs.createReadStream(filePath)
  return new Promise((resolve, reject) => {
    fileStream.on('data', data => {
      hash.update(data)
    })
    fileStream.on('end', () => {
      const sha256 = hash.digest('hex')
      resolve({
        path: filePath,
        size,
        sha256: `sha256:${sha256}`
      })
    })
    fileStream.on('error', err => {
      reject(err)
    })
  })
}
