import * as fs from 'fs'
import fsExtra from 'fs-extra'
import * as path from 'path'
import * as tar from 'tar'
import * as archiver from 'archiver'
import * as crypto from 'crypto'

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

// Copy actions files from sourceDir to targetDir, excluding files and folders not relevant to the action
// Errors if the repo appears to not contain any action files, such as an action.yml file
export function stageActionFiles(actionDir: string, targetDir: string): void {
  let actionYmlFound = false

  fsExtra.copySync(actionDir, targetDir, {
    filter: (src: string) => {
      const basename = path.basename(src)

      if (basename === 'action.yml' || basename === 'action.yaml') {
        actionYmlFound = true
      }

      // Filter out hidden folers like .git and .github
      return basename === '.' || !basename.startsWith('.')
    }
  })

  if (!actionYmlFound) {
    throw new Error(
      `No action.yml or action.yaml file found in source repository`
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
