"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActionPackageManifest = void 0;
// Given a name and archive metadata, creates a manifest in the format expected by GHCR for an Actions Package.
function createActionPackageManifest(tarFile, zipFile, repository, version, created) {
    const configLayer = createConfigLayer();
    const sanitizedRepo = sanitizeRepository(repository);
    const tarLayer = createTarLayer(tarFile, sanitizedRepo, version);
    const zipLayer = createZipLayer(zipFile, sanitizedRepo, version);
    const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        artifactType: 'application/vnd.oci.image.manifest.v1+json',
        config: configLayer,
        layers: [configLayer, tarLayer, zipLayer],
        annotations: {
            'org.opencontainers.image.created': created.toISOString(),
            'action.tar.gz.digest': tarFile.sha256,
            'action.zip.digest': zipFile.sha256,
            'com.github.package.type': 'actions_oci_pkg'
        }
    };
    return manifest;
}
exports.createActionPackageManifest = createActionPackageManifest;
// TODO: is this ok hardcoded?
function createConfigLayer() {
    const configLayer = {
        mediaType: 'application/vnd.github.actions.package.config.v1+json',
        size: 0,
        digest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        annotations: {
            'org.opencontainers.image.title': 'config.json'
        }
    };
    return configLayer;
}
function createZipLayer(zipFile, repository, version) {
    const zipLayer = {
        mediaType: 'application/vnd.github.actions.package.layer.v1.zip',
        size: zipFile.size,
        digest: zipFile.sha256,
        annotations: {
            'org.opencontainers.image.title': `${repository}_${version}.zip`
        }
    };
    return zipLayer;
}
function createTarLayer(tarFile, repository, version) {
    const tarLayer = {
        mediaType: 'application/vnd.github.actions.package.layer.v1.tar+gzip',
        size: tarFile.size,
        digest: tarFile.sha256,
        annotations: {
            'org.opencontainers.image.title': `${repository}_${version}.tar.gz`
        }
    };
    return tarLayer;
}
// Remove slashes so we can use the repository in a filename
// repository usually includes the namespace too, e.g. my-org/my-repo
function sanitizeRepository(repository) {
    return repository.replace('/', '-');
}
//# sourceMappingURL=oci-container.js.map