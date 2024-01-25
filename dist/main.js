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
const semver_1 = __importDefault(require("semver"));
/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
    const tmpDirs = [];
    try {
        // Parse and validate Actions execution context, including the repository name, release name and event type
        const repository = process.env.GITHUB_REPOSITORY || '';
        if (repository === '') {
            core.setFailed(`Could not find Repository.`);
            return;
        }
        if (github.context.eventName !== 'release') {
            core.setFailed('Please ensure you have the workflow trigger as release.');
            return;
        }
        const releaseId = github.context.payload.release.id;
        const releaseTag = github.context.payload.release.tag_name;
        // Strip any leading 'v' from the tag in case the release format is e.g. 'v1.0.0' as recommended by GitHub docs
        // https://docs.github.com/en/actions/creating-actions/releasing-and-maintaining-actions
        const targetVersion = semver_1.default.parse(releaseTag.replace(/^v/, ''));
        if (!targetVersion) {
            // TODO: We may want to limit semvers to only x.x.x, without the pre-release tags, but for now we'll allow them.
            core.setFailed(`${releaseTag} is not a valid semantic version, and so cannot be uploaded as an Immutable Action.`);
            return;
        }
        // Gather & validate user inputs
        const token = core.getInput('token');
        const registryURL = new URL('https://ghcr.io/'); // TODO: Should this be dynamic? Maybe an API endpoint to grab the registry for GHES/proxima purposes.
        console.log(core.getInput('registry'));
        console.log(`registryURL: ${registryURL}`);
        // Paths to be included in the OCI image
        const paths = core.getInput('path').split(' ');
        let path = '';
        if (paths.length === 1 && fsHelper.isDirectory(paths[0])) {
            // If the path is a single directory, we can skip the bundling step
            path = paths[0];
        }
        else {
            // Otherwise, we need to bundle the files & folders into a temporary directory
            const bundleDir = fsHelper.createTempDir();
            tmpDirs.push(bundleDir);
            path = fsHelper.bundleFilesintoDirectory(paths, bundleDir);
        }
        // Create a temporary directory to store the archives
        const archiveDir = fsHelper.createTempDir();
        tmpDirs.push(archiveDir);
        const archives = await fsHelper.createArchives(path, archiveDir);
        const manifest = ociContainer.createActionPackageManifest(archives.tarFile, archives.zipFile, repository, targetVersion.raw, new Date());
        const packageURL = await ghcr.publishOCIArtifact(token, registryURL, repository, releaseId.toString(), targetVersion.raw, archives.zipFile, archives.tarFile, manifest, true);
        core.setOutput('package-url', packageURL.toString());
        // TODO: We might need to do some attestation stuff here, but unsure how to integrate it yet.
        // We might need to return the manifest JSON from the Action and link it to another action,
        // or we might be able to make an API call here. It's unclear at this point.
        core.setOutput('package-manifest', JSON.stringify(manifest));
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
//# sourceMappingURL=main.js.map