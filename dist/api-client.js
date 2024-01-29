"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContainerRegistryURL = exports.getRepositoryMetadata = void 0;
async function getRepositoryMetadata(repository, token) {
    const response = await fetch(`${process.env.GITHUB_API_URL}/repos/${repository}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch repository metadata: ${response.statusText}`);
    }
    const data = await response.json();
    // Check that the response contains the expected data
    if (!data.id || !data.owner.id) {
        throw new Error(`Failed to fetch repository metadata: ${JSON.stringify(data)}`);
    }
    return { repoId: data.id, ownerId: data.owner.id };
}
exports.getRepositoryMetadata = getRepositoryMetadata;
async function getContainerRegistryURL() {
    const response = await fetch(`${process.env.GITHUB_API_URL}/packages/container-registry-url`);
    if (!response.ok) {
        throw new Error(`Failed to fetch status page: ${response.statusText}`);
    }
    const data = await response.json();
    const registryURL = new URL(data.url);
    return registryURL;
}
exports.getContainerRegistryURL = getContainerRegistryURL;
//# sourceMappingURL=api-client.js.map