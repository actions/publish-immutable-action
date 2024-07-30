# Publish Action Package

> [!IMPORTANT]
> This action is **not ready for public use**. It is part of an upcoming public roadmap item (see [GitHub Actions: Immutable actions publishing](https://github.com/github/roadmap/issues/592)).
> Attempts to use this action to upload an OCI artifact will not work until this feature has been fully released to the public. Please do not attempt to use it until that time.

_This action_ packages _your action_ as an OCI container and publishes it to the [GitHub Container registry](ghcr.io).

This allows your action to be consumed as an _immutable_ package if a [SemVer](https://semver.org/) is specified in the consumer's workflow file.

Your action workflow must be triggered on `release` as in the following example. The release's title must follow [semantic versioning](https://semver.org/).
Consumers of your action will then be able to specify the version, e.g. 

* `- uses: your-name/your-action@v1.2.3`
* `- uses: your-name/your-action@v1`


## Usage

<!-- start usage -->
```yaml
on:
  release:

- uses: actions/publish-action-package@v1
```
<!-- end usage -->

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
