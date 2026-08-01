# Repository Instructions

## Extension versioning

- Every change that updates the extension's code, behavior, or release contents must increment the extension version before the work is considered complete.
- Keep the version identical in `manifest.json`, `package.json`, and the root package entry in `package-lock.json`.
- Use semantic versioning. Bug fixes increment the patch version unless the requested change requires a minor or major release.
- Never commit or publish an extension update with the same version as the previous release.
