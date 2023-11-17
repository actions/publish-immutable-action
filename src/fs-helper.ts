import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import * as tar from 'tar'
import * as archiver from 'archiver'
import * as crypto from 'crypto'
import * as os from 'os'
import * as zlib from 'zlib'

export function createTempDir() {
  const randomDirName = crypto.randomBytes(4).toString('hex')
  const tempDir = path.join(os.tmpdir(), randomDirName)

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir)
  }

  return tempDir
}

export function removeDir(dir: string) {
  fs.rmSync(dir, { recursive: true })
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

  return Promise.all([
    new Promise<FileMetadata>((resolve, reject) => {
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
    }),
    new Promise<FileMetadata>((resolve, reject) => {
      const tarStream = tar
        .c(
          {
            file: tarPath,
            C: distPath, // Change to the source directory for relative paths (TODO)
            gzip: true
          },
          ['.']
        )
        .then(() => {
          resolve(fileMetadata(tarPath))
        })
        .catch((err: Error) => reject(err))
    })
  ]).then(([zipFile, tarFile]) => ({ zipFile, tarFile }))
}

export function isDirectory(path: string): boolean {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory()
}

export function readFileContents(path: string): Buffer {
  return fs.readFileSync(path)
}

// Converts a file path to a filemetadata object by querying the fs for relevant metadata.
async function fileMetadata(path: string): Promise<FileMetadata> {
  const stats = fs.statSync(path)
  const size = stats.size
  const hash = crypto.createHash('sha256')
  const fileStream = fs.createReadStream(path)
  return new Promise((resolve, reject) => {
    fileStream.on('data', data => {
      hash.update(data)
    })
    fileStream.on('end', () => {
      const sha256 = hash.digest('hex')
      resolve({
        path: path,
        size: size,
        sha256: 'sha256:' + sha256
      })
    })
    fileStream.on('error', err => {
      reject(err)
    })
  })
}
