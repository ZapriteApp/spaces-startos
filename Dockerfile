FROM debian:trixie-slim

RUN apt-get update -qqy \
    && DEBIAN_FRONTEND=noninteractive apt-get install -qqy --no-install-recommends \
        ca-certificates \
        curl \
        nodejs \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Upstream publishes no checksums, so these are pinned from our own download of
# each release asset. See UPDATING.md for how to bump them.
ARG SPACES_VERSION=0.5.0
ARG SPACES_SHA256_X86_64=49f594af7bf42031d41f7ee761a629f2b42be64df9a25411de8258bdac457d40
ARG SPACES_SHA256_ARM64=00bfc65ced90e4c011fe1551dc4e4fd5b52104d58ad24611664732cc4032dd4a

# The checkpoint pinned by this spaces release (checkpoint/src/integrity.rs).
ARG CHECKPOINT_HEIGHT=967068
ARG CHECKPOINT_SHA256=d8041896e14c3be70401a83d063fb8c4ec90c32e9619ebbcdea2d2cb3f7e5453

ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64; sha="$SPACES_SHA256_X86_64" ;; \
      arm64) arch=arm64; sha="$SPACES_SHA256_ARM64" ;; \
      *) echo "unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    name="spaces-v${SPACES_VERSION}-linux-${arch}"; \
    curl -sSfL -o /tmp/spaces.tar.gz \
      "https://github.com/spacesprotocol/spaces/releases/download/spaces_client-v${SPACES_VERSION}/${name}.tar.gz"; \
    echo "${sha}  /tmp/spaces.tar.gz" | sha256sum -c -; \
    tar xzf /tmp/spaces.tar.gz -C /tmp; \
    install -m 755 "/tmp/${name}/spaced" "/tmp/${name}/space-cli" /usr/local/bin/; \
    rm -rf /tmp/spaces.tar.gz "/tmp/${name}"

RUN set -eu; \
    mkdir -p /opt/spaces; \
    curl -sSfL -o /opt/spaces/checkpoint.tar.gz \
      "https://checkpoints.spacesprotocol.org/checkpoint-${CHECKPOINT_HEIGHT}.tar.gz"; \
    echo "${CHECKPOINT_SHA256}  /opt/spaces/checkpoint.tar.gz" | sha256sum -c -

# The dashboard: plain Node, no npm dependencies.
COPY ui /opt/spaces-ui

WORKDIR /data

STOPSIGNAL SIGINT
