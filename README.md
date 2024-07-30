# Publish Immutable Action

> [!IMPORTANT]
> This action is **not ready for public use**. It is part of an upcoming public roadmap item (see [GitHub Actions: Immutable actions publishing](https://github.com/github/roadmap/issues/592)).
> Attempts to use this action to upload an OCI artifact will not work until this feature has been fully released to the public. Please do not attempt to use it until that time.

This action packages _your action_ as an [OCI container](https://opencontainers.org/) and publishes it to the [GitHub Container registry](https://ghcr.io).
This allows your action to be consumed as an _immutable_ package if a [SemVer](https://semver.org/) is specified in the consumer's workflow file.

Your workflow can be triggered by any [event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows) which has a `GITHUB_REF` that points to a git tag. Some examples of these events are:

- [`release`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#release)
- [`push`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#push) (only applies to pushed tags)
- [`workflow_dispatch`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch) (only applies subject of dispatch is a tag)

The associated tag must follow [semantic versioning](https://semver.org/) - this tag value will be used to create a package version.

Consumers of your action will then be able to specify that version to consume your action from the package, e.g.

- `- uses: your-name/your-action@v1.2.3`
- `- uses: your-name/your-action@v1`

Such packages will come with stronger security guarantees for consumers than existing git-based action resolution, such as:

- Provenance attestations generated using the [`@actions/attest`](https://github.com/actions/toolkit/tree/main/packages/attest) package
- Tag immutability - it will not be possible to overwrite tags once published, ensuring versions of an action can't change once in use
- Namespace immutability - it will not be possible to delete and recreate the package with different content; this would undermine tag immutability

## Usage

An actions workflow file like the following should be placed in your action repository:

<!-- start usage -->
```yaml
name: "Publish Actions Package"

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      packages: write
      contents: write
      actions: read
    steps:
    - name: Check out repo
      uses: actions/checkout@v4
    - name: Publish
      id: publish
      uses: actions/publish-immutable-action@v1
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```
<!-- end usage -->

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
