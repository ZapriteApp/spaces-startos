# Updating

Upstream is the Spaces client release on GitHub: <https://github.com/spacesprotocol/spaces/releases> (tags `spaces_client-vX.Y.Z`).

The pins live in `Dockerfile`:

- `SPACES_VERSION` and the two `SPACES_SHA256_*` values. Upstream publishes no checksums, so compute them from the release assets:

  ```bash
  for a in x86_64 arm64; do curl -sSfL https://github.com/spacesprotocol/spaces/releases/download/spaces_client-vX.Y.Z/spaces-vX.Y.Z-linux-$a.tar.gz | shasum -a 256; done
  ```

- `CHECKPOINT_HEIGHT` and `CHECKPOINT_SHA256`. Copy them from `checkpoint/src/integrity.rs` at the release tag, so the checkpoint matches what that release pins.

Then bump `version` in `startos/versions/current.ts` (or add a new version file) and rebuild.
