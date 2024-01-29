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
exports.publishOCIArtifact = void 0;
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
const fsHelper = __importStar(require("./fs-helper"));
const axios_debug_log_1 = __importDefault(require("axios-debug-log"));
// Publish the OCI artifact and return the URL where it can be downloaded
async function publishOCIArtifact(token, registry, repository, semver, zipFile, tarFile, manifest, debugRequests = false) {
    if (debugRequests) {
        configureRequestDebugLogging();
    }
    const b64Token = Buffer.from(token).toString('base64');
    const checkBlobEndpoint = new URL(`v2/${repository}/blobs/`, registry).toString();
    const uploadBlobEndpoint = new URL(`v2/${repository}/blobs/uploads/`, registry).toString();
    const manifestEndpoint = new URL(`v2/${repository}/manifests/${semver}`, registry).toString();
    core.info(`Creating GHCR package for release with semver:${semver} with path:"${zipFile.path}" and "${tarFile.path}".`);
    const layerUploads = manifest.layers.map(async (layer) => {
        switch (layer.mediaType) {
            case 'application/vnd.github.actions.package.layer.v1.tar+gzip':
                return uploadLayer(layer, tarFile, registry, checkBlobEndpoint, uploadBlobEndpoint, b64Token);
            case 'application/vnd.github.actions.package.layer.v1.zip':
                return uploadLayer(layer, zipFile, registry, checkBlobEndpoint, uploadBlobEndpoint, b64Token);
            case 'application/vnd.github.actions.package.config.v1+json':
                return uploadLayer(layer, { path: '', size: 0, sha256: layer.digest }, registry, checkBlobEndpoint, uploadBlobEndpoint, b64Token);
            default:
                throw new Error(`Unknown media type ${layer.mediaType}`);
        }
    });
    await Promise.all(layerUploads);
    const digest = await uploadManifest(JSON.stringify(manifest), manifestEndpoint, b64Token);
    return { packageURL: new URL(`${repository}:${semver}`, registry), manifestDigest: digest };
}
exports.publishOCIArtifact = publishOCIArtifact;
async function uploadLayer(layer, file, registryURL, checkBlobEndpoint, uploadBlobEndpoint, b64Token) {
    const checkExistsResponse = await axios_1.default.head(checkBlobEndpoint + layer.digest, {
        headers: {
            Authorization: `Bearer ${b64Token}`
        },
        validateStatus: () => {
            return true; // Allow non 2xx responses
        }
    });
    if (checkExistsResponse.status === 200 ||
        checkExistsResponse.status === 202) {
        core.info(`Layer ${layer.digest} already exists. Skipping upload.`);
        return;
    }
    if (checkExistsResponse.status !== 404) {
        throw new Error(`Unexpected response from blob check for layer ${layer.digest}: ${checkExistsResponse.status} ${checkExistsResponse.statusText}`);
    }
    core.info(`Uploading layer ${layer.digest}.`);
    const initiateUploadResponse = await axios_1.default.post(uploadBlobEndpoint, layer, {
        headers: {
            Authorization: `Bearer ${b64Token}`
        },
        validateStatus: () => {
            return true; // Allow non 2xx responses
        }
    });
    if (initiateUploadResponse.status !== 202) {
        core.error(`Unexpected response from upload post ${uploadBlobEndpoint}: ${initiateUploadResponse.status}`);
        throw new Error(`Unexpected response from POST upload ${initiateUploadResponse.status}`);
    }
    const locationResponseHeader = initiateUploadResponse.headers['location'];
    if (locationResponseHeader === undefined) {
        throw new Error(`No location header in response from upload post ${uploadBlobEndpoint} for layer ${layer.digest}`);
    }
    const pathname = `${locationResponseHeader}?digest=${layer.digest}`;
    const uploadBlobUrl = new URL(pathname, registryURL).toString();
    // TODO: must we handle the empty config layer? Maybe we can just skip calling this at all
    let data;
    if (file.size === 0) {
        data = Buffer.alloc(0);
    }
    else {
        data = fsHelper.readFileContents(file.path);
    }
    const putResponse = await axios_1.default.put(uploadBlobUrl, data, {
        headers: {
            Authorization: `Bearer ${b64Token}`,
            'Content-Type': 'application/octet-stream',
            'Accept-Encoding': 'gzip', // TODO: What about for the config layer?
            'Content-Length': layer.size.toString()
        },
        validateStatus: () => {
            return true; // Allow non 2xx responses
        }
    });
    if (putResponse.status !== 201) {
        throw new Error(`Unexpected response from PUT upload ${putResponse.status} for layer ${layer.digest}`);
    }
}
// Uploads the manifest and returns the digest returned by GHCR
async function uploadManifest(manifestJSON, manifestEndpoint, b64Token) {
    core.info(`Uploading manifest to ${manifestEndpoint}.`);
    const putResponse = await axios_1.default.put(manifestEndpoint, manifestJSON, {
        headers: {
            Authorization: `Bearer ${b64Token}`,
            'Content-Type': 'application/vnd.oci.image.manifest.v1+json'
        },
        validateStatus: () => {
            return true; // Allow non 2xx responses
        }
    });
    if (putResponse.status !== 201) {
        throw new Error(`Unexpected response from PUT manifest ${putResponse.status}`);
    }
    const digestResponseHeader = putResponse.headers['Docker-Content-Digest'];
    if (digestResponseHeader === undefined) {
        throw new Error(`No digest header in response from PUT manifest ${manifestEndpoint}`);
    }
    return digestResponseHeader;
}
function configureRequestDebugLogging() {
    (0, axios_debug_log_1.default)({
        request: (debug, config) => {
            core.debug(`Request with ${config}`);
        },
        response: (debug, response) => {
            core.debug(`Response with ${response}`);
        },
        error: (debug, error) => {
            core.debug(`Error with ${error}`);
        }
    });
}
//# sourceMappingURL=ghcr-client.js.map