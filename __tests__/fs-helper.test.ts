import * as fsHelper from '../src/fs-helper'
import * as fs from 'fs'
import * as os from 'os'
import { execSync } from 'child_process'

const fileContent = 'This is the content of the file'
const tmpFileDir = '/tmp'

describe('stageActionFiles', () => {
  let sourceDir: string
  let stagingDir: string

  beforeEach(() => {
    sourceDir = fsHelper.createTempDir(tmpFileDir, 'source')
    fs.mkdirSync(`${sourceDir}/src`)
    fs.writeFileSync(`${sourceDir}/src/main.js`, fileContent)
    fs.writeFileSync(`${sourceDir}/src/other.js`, fileContent)

    stagingDir = fsHelper.createTempDir(tmpFileDir, 'staging')
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
    stageDir = fsHelper.createTempDir(tmpFileDir, 'staging')
    fs.writeFileSync(`${stageDir}/hello.txt`, fileContent)
    fs.writeFileSync(`${stageDir}/world.txt`, fileContent)
  })

  beforeEach(() => {
    archiveDir = fsHelper.createTempDir(tmpFileDir, 'archive')
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
    const tmpDir = fsHelper.createTempDir(tmpFileDir, 'subdir')

    expect(fs.existsSync(tmpDir)).toEqual(true)
    expect(fs.statSync(tmpDir).isDirectory()).toEqual(true)
  })

  it('creates a unique temporary directory', () => {
    const dir1 = fsHelper.createTempDir(tmpFileDir, 'dir1')
    dirs.push(dir1)

    const dir2 = fsHelper.createTempDir(tmpFileDir, 'dir2')
    dirs.push(dir2)

    expect(dir1).not.toEqual(dir2)
  })
})

describe('isDirectory', () => {
  let dir: string

  beforeEach(() => {
    dir = fsHelper.createTempDir(tmpFileDir, 'subdir')
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
    dir = fsHelper.createTempDir(tmpFileDir, 'subdir')
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

describe('ensureCorrectShaCheckedOut', () => {
  let dir: string
  let commit1: string
  let commit2: string
  const tag1 = 'tag1'
  const tag2 = 'tag2'

  beforeEach(() => {
    dir = fsHelper.createTempDir(tmpFileDir, 'subdir')

    // Set up a git repository
    execSync('git init', { cwd: dir })

    // Set user and email in this git repo (not globally)
    execSync('git config user.email monalisa@github.com', { cwd: dir })
    execSync('git config user.name Mona', { cwd: dir })

    // Add two commits
    execSync('git commit --allow-empty -m "test"', { cwd: dir })
    execSync('git commit --allow-empty -m "test"', { cwd: dir })

    // Grab the two commits
    commit1 = execSync('git rev-parse HEAD~1', { cwd: dir }).toString().trim()
    commit2 = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim()

    // Create a tag for each commit
    execSync(`git tag ${tag1} ${commit1}`, { cwd: dir })
    execSync(`git tag ${tag2} ${commit2}`, { cwd: dir })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true })
  })

  it('does not throw an error if the correct SHA is checked out', async () => {
    await expect(
      fsHelper.ensureCorrectShaCheckedOut(`refs/tags/${tag2}`, commit2, dir)
    ).resolves.toBeUndefined()
  })

  it('throws an error if the correct SHA is not checked out', async () => {
    await expect(
      fsHelper.ensureCorrectShaCheckedOut(`refs/tags/${tag1}`, commit1, dir)
    ).rejects.toThrow()
  })

  it('throws an error if the sha of the tag does not match expected sha', async () => {
    await expect(async () =>
      fsHelper.ensureCorrectShaCheckedOut(`refs/tags/${tag1}`, commit2, dir)
    ).rejects.toThrow()
  })
})
