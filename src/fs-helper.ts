import * as fs from 'fs'
import fsExtra from 'fs-extra'
import * as path from 'path'
import * as tar from 'tar'
import * as archiver from 'archiver'
import * as crypto from 'crypto'
import * as os from 'os'

export function createTempDir(): string {
  const randomDirName = crypto.randomBytes(4).toString('hex')
  const tempDir = path.join(os.tmpdir(), randomDirName)

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir)
  }

  return tempDir
}

export function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true })
  }
}

export interface FileMetadata {
  path: string
  size: number
  sha256: string
}

// Creates both a tar.gz and zip archive of the given directory and returns the paths to both archives (stored in the provided target directory)
// as well as the size/sha256 hash of each file.
export async function createArchives(
  distPath: string,
  archiveTargetPath: string = createTempDir()
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
    archive.directory(distPath, false)
    archive.finalize()
  })

  const createTarPromise = new Promise<FileMetadata>((resolve, reject) => {
    tar
      .c(
        {
          file: tarPath,
          C: distPath, // Change to the source directory for relative paths (TODO)
          gzip: true
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

export function bundleFilesintoDirectory(
  files: string[],
  targetDir: string = createTempDir()
): string {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`File ${file} does not exist`)
    }

    if (isDirectory(file)) {
      const targetFolder = path.join(targetDir, path.basename(file))
      fsExtra.copySync(file, targetFolder)
    } else {
      const targetFile = path.join(targetDir, path.basename(file))
      fs.copyFileSync(file, targetFile)
    }
  }

  return targetDir
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
