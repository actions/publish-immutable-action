"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundleFilesintoDirectory = exports.readFileContents = exports.isDirectory = exports.createArchives = exports.removeDir = exports.createTempDir = void 0;
const fs = __importStar(require("fs"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path = __importStar(require("path"));
const tar = __importStar(require("tar"));
const archiver = __importStar(require("archiver"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
function createTempDir() {
    const randomDirName = crypto.randomBytes(4).toString('hex');
    const tempDir = path.join(os.tmpdir(), randomDirName);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    return tempDir;
}
exports.createTempDir = createTempDir;
function removeDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
    }
}
exports.removeDir = removeDir;
// Creates both a tar.gz and zip archive of the given directory and returns the paths to both archives (stored in the provided target directory)
// as well as the size/sha256 hash of each file.
async function createArchives(distPath, archiveTargetPath = createTempDir()) {
    const zipPath = path.join(archiveTargetPath, `archive.zip`);
    const tarPath = path.join(archiveTargetPath, `archive.tar.gz`);
    const createZipPromise = new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver.create('zip');
        output.on('error', (err) => {
            reject(err);
        });
        archive.on('error', (err) => {
            reject(err);
        });
        output.on('close', () => {
            resolve(fileMetadata(zipPath));
        });
        archive.pipe(output);
        archive.directory(distPath, false);
        archive.finalize();
    });
    const createTarPromise = new Promise((resolve, reject) => {
        tar
            .c({
            file: tarPath,
            C: distPath, // Change to the source directory for relative paths (TODO)
            gzip: true
        }, ['.'])
            // eslint-disable-next-line github/no-then
            .catch(err => {
            reject(err);
        })
            // eslint-disable-next-line github/no-then
            .then(() => {
            resolve(fileMetadata(tarPath));
        });
    });
    const [zipFile, tarFile] = await Promise.all([
        createZipPromise,
        createTarPromise
    ]);
    return { zipFile, tarFile };
}
exports.createArchives = createArchives;
function isDirectory(dirPath) {
    return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
}
exports.isDirectory = isDirectory;
function readFileContents(filePath) {
    return fs.readFileSync(filePath);
}
exports.readFileContents = readFileContents;
function bundleFilesintoDirectory(files, targetDir = createTempDir()) {
    for (const file of files) {
        if (!fs.existsSync(file)) {
            throw new Error(`File ${file} does not exist`);
        }
        if (isDirectory(file)) {
            const targetFolder = path.join(targetDir, path.basename(file));
            fs_extra_1.default.copySync(file, targetFolder);
        }
        else {
            const targetFile = path.join(targetDir, path.basename(file));
            fs.copyFileSync(file, targetFile);
        }
    }
    return targetDir;
}
exports.bundleFilesintoDirectory = bundleFilesintoDirectory;
// Converts a file path to a filemetadata object by querying the fs for relevant metadata.
async function fileMetadata(filePath) {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    const hash = crypto.createHash('sha256');
    const fileStream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
        fileStream.on('data', data => {
            hash.update(data);
        });
        fileStream.on('end', () => {
            const sha256 = hash.digest('hex');
            resolve({
                path: filePath,
                size,
                sha256: `sha256:${sha256}`
            });
        });
        fileStream.on('error', err => {
            reject(err);
        });
    });
}
//# sourceMappingURL=fs-helper.js.map