import * as fsHelper from '../src/fs-helper'
import * as fs from 'fs'
import * as os from 'os'
import { execSync } from 'child_process'

const fileContent = 'This is the content of the file'

describe('stageActionFiles', () => {
  let sourceDir: string
  let stagingDir: string

  beforeEach(() => {
    process.env['RUNNER_TEMP'] = '/tmp'
    sourceDir = fsHelper.createTempDir('source')
    fs.mkdirSync(`${sourceDir}/src`)
    fs.writeFileSync(`${sourceDir}/src/main.js`, fileContent)
    fs.writeFileSync(`${sourceDir}/src/other.js`, fileContent)

    stagingDir = fsHelper.createTempDir('staging')
  })

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true })
    fs.rmSync(stagingDir, { recursive: true })
  })

  it('returns an error if no action.yml file is present', () => {
    expect(() => fsHelper.stageActionFiles(sourceDir, stagingDir)).toThrow(
      /^No action.yml or action.yaml file found in source repository/
    )
  })

  it('copies all non-hidden files to the staging directory', () => {
    fs.writeFileSync(`${sourceDir}/action.yml`, fileContent)

    fs.mkdirSync(`${sourceDir}/.git`)
    fs.writeFileSync(`${sourceDir}/.git/HEAD`, fileContent)

    fs.mkdirSync(`${sourceDir}/.github/workflows`, { recursive: true })
    fs.writeFileSync(`${sourceDir}/.github/workflows/workflow.yml`, fileContent)

    fsHelper.stageActionFiles(sourceDir, stagingDir)
    expect(fs.existsSync(`${stagingDir}/action.yml`)).toBe(true)
    expect(fs.existsSync(`${stagingDir}/src/main.js`)).toBe(true)
    expect(fs.existsSync(`${stagingDir}/src/other.js`)).toBe(true)

    // Hidden files should not be copied
    expect(fs.existsSync(`${stagingDir}/.git`)).toBe(false)
    expect(fs.existsSync(`${stagingDir}/.github`)).toBe(false)
  })

  it('copies all non-hidden files to the staging directory, even if action.yml is in a subdirectory', () => {
    fs.mkdirSync(`${sourceDir}/my-sub-action`, { recursive: true })
    fs.writeFileSync(`${sourceDir}/my-sub-action/action.yml`, fileContent)

    fsHelper.stageActionFiles(sourceDir, stagingDir)
    expect(fs.existsSync(`${stagingDir}/src/main.js`)).toBe(true)
    expect(fs.existsSync(`${stagingDir}/src/other.js`)).toBe(true)
    expect(fs.existsSync(`${stagingDir}/my-sub-action/action.yml`)).toBe(true)
  })

  it('accepts action.yaml as a valid action file as well as action.yml', () => {
    fs.writeFileSync(`${sourceDir}/action.yaml`, fileContent)

    fsHelper.stageActionFiles(sourceDir, stagingDir)
    expect(fs.existsSync(`${stagingDir}/action.yaml`)).toBe(true)
  })
})

describe('createArchives', () => {
  let stageDir: string
  let archiveDir: string

  beforeAll(() => {
    process.env['RUNNER_TEMP'] = '/tmp'
    stageDir = fsHelper.createTempDir('staging')
    fs.writeFileSync(`${stageDir}/hello.txt`, fileContent)
    fs.writeFileSync(`${stageDir}/world.txt`, fileContent)
  })

  beforeEach(() => {
    archiveDir = fsHelper.createTempDir('archive')
  })

  afterEach(() => {
    fs.rmSync(archiveDir, { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(stageDir, { recursive: true })
  })

  it('creates archives', async () => {
    const { zipFile, tarFile } = await fsHelper.createArchives(
      stageDir,
      archiveDir
    )

    expect(zipFile.path).toEqual(`${archiveDir}/archive.zip`)
    expect(fs.existsSync(zipFile.path)).toEqual(true)
    expect(fs.statSync(zipFile.path).size).toBeGreaterThan(0)
    expect(zipFile.sha256.startsWith('sha256:')).toEqual(true)

    expect(tarFile.path).toEqual(`${archiveDir}/archive.tar.gz`)
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

  it('creates a temporary directory', () => {
    process.env['RUNNER_TEMP'] = '/tmp'
    const tmpDir = fsHelper.createTempDir('subdir')

    expect(fs.existsSync(tmpDir)).toEqual(true)
    expect(fs.statSync(tmpDir).isDirectory()).toEqual(true)
  })

  it('creates a unique temporary directory', () => {
    process.env['RUNNER_TEMP'] = '/tmp'
    const dir1 = fsHelper.createTempDir('dir1')
    dirs.push(dir1)

    const dir2 = fsHelper.createTempDir('dir2')
    dirs.push(dir2)

    expect(dir1).not.toEqual(dir2)
  })
})

describe('isDirectory', () => {
  let dir: string

  beforeEach(() => {
    process.env['RUNNER_TEMP'] = '/tmp'
    dir = fsHelper.createTempDir('subdir')
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

describe('readFileContents', () => {
  let dir: string

  beforeEach(() => {
    process.env['RUNNER_TEMP'] = '/tmp'
    dir = fsHelper.createTempDir('subdir')
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
