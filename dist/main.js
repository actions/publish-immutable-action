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
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const fsHelper = __importStar(require("./fs-helper"));
const ociContainer = __importStar(require("./oci-container"));
const ghcr = __importStar(require("./ghcr-client"));
const api = __importStar(require("./api-client"));
const semver_1 = __importDefault(require("semver"));
/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run(pathInput) {
    const tmpDirs = [];
    try {
        const repository = process.env.GITHUB_REPOSITORY || '';
        if (repository === '') {
            core.setFailed(`Could not find Repository.`);
            return;
        }
        const token = process.env.TOKEN || '';
        const sourceCommit = process.env.GITHUB_SHA || '';
        if (token === '') {
            core.setFailed(`Could not find source commit.`);
            return;
        }
        if (sourceCommit === '') {
            core.setFailed(`Could not find source commit.`);
            return;
        }
        const semanticVersion = parseSourceSemanticVersion();
        // Create a temporary directory to stage files for packaging in archives
        const stagedActionFilesDir = fsHelper.createTempDir();
        tmpDirs.push(stagedActionFilesDir);
        fsHelper.stageActionFiles(".", stagedActionFilesDir);
        // Create a temporary directory to store the archives
        const archiveDir = fsHelper.createTempDir();
        tmpDirs.push(archiveDir);
        const archives = await fsHelper.createArchives(stagedActionFilesDir, archiveDir);
        const { repoId, ownerId } = await api.getRepositoryMetadata(repository, token);
        const manifest = ociContainer.createActionPackageManifest(archives.tarFile, archives.zipFile, repository, repoId, ownerId, sourceCommit, semanticVersion.raw, new Date());
        const containerRegistryURL = await api.getContainerRegistryURL();
        console.log(`Container registry URL: ${containerRegistryURL}`);
        const { packageURL, manifestDigest } = await ghcr.publishOCIArtifact(token, containerRegistryURL, repository, semanticVersion.raw, archives.zipFile, archives.tarFile, manifest, true);
        core.setOutput('package-url', packageURL.toString());
        core.setOutput('package-manifest', JSON.stringify(manifest));
        core.setOutput('package-manifest-sha', `sha256:${manifestDigest}`);
    }
    catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error)
            core.setFailed(error.message);
    }
    finally {
        // Clean up any temporary directories that exist
        for (const tmpDir of tmpDirs) {
            if (tmpDir !== '') {
                fsHelper.removeDir(tmpDir);
            }
        }
    }
}
exports.run = run;
// This action can be triggered by release events or tag push events.
// In each case, the source event should produce a Semantic Version compliant tag representing the code to be packaged.
function parseSourceSemanticVersion() {
    const event = github.context.eventName;
    var semverTag = '';
    // Grab the raw tag
    if (event === 'release')
        semverTag = github.context.payload.release.tag_name;
    else if (event === 'push' && github.context.ref.startsWith('refs/tags/')) {
        semverTag = github.context.ref.replace(/^refs\/tags\//, '');
    }
    else {
        throw new Error(`This action can only be triggered by release events or tag push events.`);
    }
    if (semverTag === '') {
        throw new Error(`Could not find a Semantic Version tag in the event payload.`);
    }
    const semanticVersion = semver_1.default.parse(semverTag.replace(/^v/, ''));
    if (!semanticVersion) {
        throw new Error(`${semverTag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`);
    }
    return semanticVersion;
}
//# sourceMappingURL=main.js.map