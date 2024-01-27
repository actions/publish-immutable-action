import * as fsHelper from '../src/fs-helper'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'

const fileContent = 'This is the content of the file'

describe('getConsolidatedDirectory', () => {
  let sourceDir: string

  beforeAll(() => {
    sourceDir = `.`// fsHelper.createTempDir()
    fs.mkdirSync(`${sourceDir}/folder1`)
    fs.mkdirSync(`${sourceDir}/folder2`)
    fs.mkdirSync(`${sourceDir}/folder2/folder3`)
    fs.writeFileSync(`${sourceDir}/file0.txt`, fileContent)
    fs.writeFileSync(`${sourceDir}/folder1/file1.txt`, fileContent)
    fs.writeFileSync(`${sourceDir}/folder2/file2.txt`, fileContent)
    fs.writeFileSync(`${sourceDir}/folder2/folder3/file3.txt`, fileContent)
  })

  beforeEach(() => {
  })

  afterEach(() => {
  })

  afterAll(() => {
    fs.rmSync(`file0.txt`)
    fs.rmSync(`folder1`, { recursive: true })
    fs.rmSync(`folder2`, { recursive: true })
  })


  it("returns the directory itself if it is a single directory, and instructed to not clean it up", () => {
    // TODO: In these tests, we're not really distinguishing between the `publish-action-package` directory and the consumer repo directory, i.e., they share the same space.
    // In real life, when the consumer workflow runs, its own javascript is in ., but 
    // the publish-action-package's code is in ${{github.action_path}}.
    // So.... I guess to emulate this, we should create a temp directory (representing the consumer repo)
    // and cd there before the test starts?
    const { consolidatedPath, needToCleanUpDir } = fsHelper.getConsolidatedDirectory(".")

    expect(needToCleanUpDir).toBe(false)
    expect(consolidatedPath).toBe(".")
    expect(fsHelper.readFileContents(`file0.txt`).toString()).toEqual(fileContent)
    expect(fsHelper.readFileContents(`folder1/file1.txt`).toString()).toEqual(fileContent)
    expect(fsHelper.readFileContents(`folder2/file2.txt`).toString()).toEqual(fileContent)
    expect(fsHelper.readFileContents(`folder2/folder3/file3.txt`).toString()).toEqual(fileContent)

  })
  it('returns a new directory containing copies of the multiple paths if they are legally specified, and instruct to clean it up', () => {
    const { consolidatedPath, needToCleanUpDir } = fsHelper.getConsolidatedDirectory("file0.txt folder1")

    expect(needToCleanUpDir).toBe(true)
    expect(consolidatedPath).not.toBe(".")
    expect(fsHelper.readFileContents(path.join(consolidatedPath, `file0.txt`)).toString()).toEqual(fileContent)
    expect(fsHelper.readFileContents(path.join(consolidatedPath, `folder1/file1.txt`)).toString()).toEqual(fileContent)
    expect(fs.existsSync(path.join(consolidatedPath, `folder2/file2.txt`))).toEqual(false)
    expect(fs.existsSync(path.join(consolidatedPath, `folder2/folder3/file3.txt`))).toEqual(false)
  })

  it('what happens here?', () => {
    const { consolidatedPath, needToCleanUpDir } = fsHelper.getConsolidatedDirectory("folder1 folder2/folder3")

    expect(needToCleanUpDir).toBe(true)
    expect(consolidatedPath).not.toBe(".")
    expect(fs.existsSync(path.join(consolidatedPath, `file0.txt`))).toEqual(false)
    expect(fsHelper.readFileContents(path.join(consolidatedPath, `folder1/file1.txt`)).toString()).toEqual(fileContent)
    expect(fs.existsSync(path.join(consolidatedPath, `folder2/file2.txt`))).toEqual(false)
    expect(fsHelper.readFileContents(path.join(consolidatedPath, `folder3/file3.txt`)).toString()).toEqual(fileContent) // <--- TODO: This is what I'm unsure of
  })

  it('throws an error for illegal path spec - single', () => {
    expect(() => {
      const { consolidatedPath, needToCleanUpDir } = fsHelper.getConsolidatedDirectory("folder4")
    }).toThrow('filePath folder4 does not exist')
  })

  it('throws an error for illegal path spec - multiple', () => {
    expect(() => {
      const { consolidatedPath, needToCleanUpDir } = fsHelper.getConsolidatedDirectory("folder1 folder4")
    }).toThrow('filePath folder4 does not exist')
  })

  // TODO: consider doing the thing Michael suggested where we exclude directories starting with .
})

describe('createArchives', () => {
  let tmpDir: string
  let distDir: string

  beforeAll(() => {
    distDir = fsHelper.createTempDir()
    fs.writeFileSync(`${distDir}/hello.txt`, fileContent)
    fs.writeFileSync(`${distDir}/world.txt`, fileContent)
  })

  beforeEach(() => {
    tmpDir = fsHelper.createTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(distDir, { recursive: true })
  })

  it('creates archives', async () => {
    const { zipFile, tarFile } = await fsHelper.createArchives(distDir, tmpDir)

    expect(zipFile.path).toEqual(`${tmpDir}/archive.zip`)
    expect(fs.existsSync(zipFile.path)).toEqual(true)
    expect(fs.statSync(zipFile.path).size).toBeGreaterThan(0)
    expect(zipFile.sha256.startsWith('sha256:')).toEqual(true)

    expect(tarFile.path).toEqual(`${tmpDir}/archive.tar.gz`)
    expect(fs.existsSync(tarFile.path)).toEqual(true)
    expect(fs.statSync(tarFile.path).size).toBeGreaterThan(0)
    expect(tarFile.sha256.startsWith('sha256:')).toEqual(true)

    // Validate the hashes by comparing to the output of the system's hashing utility
    const zipSHA = zipFile.sha256.substring(7) // remove "sha256:" prefix
    const tarSHA = tarFile.sha256.substring(7) // remove "sha256:" prefix

    // sha256 hash is 64 characters long
    expect(zipSHA).toHaveLength(64)
    expect(tarSHA).toHaveLength(64)

    let systemZipHash: string
    let systemTarHash: string

    if (os.platform() === 'win32') {
      // Windows
      systemZipHash = execSync(`CertUtil -hashfile ${zipFile.path} SHA256`)
        .toString()
        .split(' ')[1]
        .trim()
      systemTarHash = execSync(`CertUtil -hashfile ${tarFile.path} SHA256`)
        .toString()
        .split(' ')[1]
        .trim()
    } else {
      // Unix-based systems
      systemZipHash = execSync(`shasum -a 256 ${zipFile.path}`)
        .toString()
        .split(' ')[0]
      systemTarHash = execSync(`shasum -a 256 ${tarFile.path}`)
        .toString()
        .split(' ')[0]
    }

    expect(zipSHA).toEqual(systemZipHash)
    expect(tarSHA).toEqual(systemTarHash)
  })
})

describe('createTempDir', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true })
    }
  })

  it('creates a temporary directory in the OS temporary dir', () => {
    const tmpDir = fsHelper.createTempDir()
    dirs.push(tmpDir)

    expect(fs.existsSync(tmpDir)).toEqual(true)
    expect(fs.statSync(tmpDir).isDirectory()).toEqual(true)
    expect(tmpDir.startsWith(os.tmpdir())).toEqual(true)
  })

  it('creates a unique temporary directory', () => {
    const dir1 = fsHelper.createTempDir()
    dirs.push(dir1)

    const dir2 = fsHelper.createTempDir()
    dirs.push(dir2)

    expect(dir1).not.toEqual(dir2)
  })
})

describe('isDirectory', () => {
  let dir: string

  beforeEach(() => {
    dir = fsHelper.createTempDir()
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true })
  })

  it('returns true if the path is a directory', () => {
    expect(fsHelper.isDirectory(dir)).toEqual(true)
  })

  it('returns false if the path is not a directory', () => {
    const tempFile = `${dir}/file.txt`
    fs.writeFileSync(tempFile, fileContent)
    expect(fsHelper.isDirectory(tempFile)).toEqual(false)
  })
})

describe('isActionRepo', () => {
  let stagingDir: string

  beforeEach(() => {
    stagingDir = fsHelper.createTempDir()
  })

  afterEach(() => {
    fs.rmSync(stagingDir, { recursive: true })
  })

  it('returns true if action.yml exists at the root', () => {
    fs.writeFileSync(path.join(stagingDir, `action.yml`), fileContent)
    expect(fsHelper.isActionRepo(stagingDir)).toEqual(true)
  })

  it('returns true if action.yaml exists at the root', () => {
    fs.writeFileSync(path.join(stagingDir, `action.yaml`), fileContent)
    expect(fsHelper.isActionRepo(stagingDir)).toEqual(true)
  })

  it("returns false if action.y(a)ml doesn't exist at the root", () => {
    fs.writeFileSync(path.join(stagingDir, `action.yaaml`), fileContent)
    expect(fsHelper.isActionRepo(stagingDir)).toEqual(false)
  })
})

describe('readFileContents', () => {
  let dir: string

  beforeEach(() => {
    dir = fsHelper.createTempDir()
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true })
  })

  it('reads the contents of a file', () => {
    const tempFile = `${dir}/file.txt`
    fs.writeFileSync(tempFile, fileContent)

    expect(fsHelper.readFileContents(tempFile).toString()).toEqual(fileContent)
  })
})

describe('removeDir', () => {
  let dir: string

  beforeEach(() => {
    dir = fsHelper.createTempDir()
  })

  afterEach(() => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true })
    }
  })

  it('removes a directory', () => {
    fsHelper.removeDir(dir)
    expect(fs.existsSync(dir)).toEqual(false)
  })
})

/*
describe('bundleFilesintoDirectory', () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    sourceDir = fsHelper.createTempDir()
    targetDir = fsHelper.createTempDir()
  })

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true })
    fs.rmSync(targetDir, { recursive: true })
  })

  it('bundles files and folders into a directory', () => {
    // Create some test files and folders in the sourceDir
    const file1 = `${sourceDir}/file1.txt`
    const folder1 = `${sourceDir}/folder1`
    const file2 = `${folder1}/file2.txt`
    const folder2 = `${folder1}/folder2`
    const file3 = `${folder2}/file3.txt`

    fs.mkdirSync(folder1)
    fs.mkdirSync(folder2)
    fs.writeFileSync(file1, fileContent)
    fs.writeFileSync(file2, fileContent)
    fs.writeFileSync(file3, fileContent)

    // Bundle the files and folders into the targetDir
    fsHelper.bundleFilesintoDirectory([file1, folder1])

    // Check that the files and folders were copied
    expect(fs.existsSync(file1)).toEqual(true)
    expect(fsHelper.readFileContents(file1).toString()).toEqual(fileContent)

    expect(fs.existsSync(`${targetDir}/folder1`)).toEqual(true)

    expect(fs.existsSync(file2)).toEqual(true)
    expect(fsHelper.readFileContents(file2).toString()).toEqual(fileContent)

    expect(fs.existsSync(`${targetDir}/folder1/folder2`)).toEqual(true)
    expect(fs.existsSync(file3)).toEqual(true)
    expect(fsHelper.readFileContents(file3).toString()).toEqual(fileContent)
  })

  it('throws an error if a file or directory does not exist', () => {
    expect(() => {
      fsHelper.bundleFilesintoDirectory(['/does/not/exist'])
    }).toThrow('File /does/not/exist does not exist')
  })
})
*/