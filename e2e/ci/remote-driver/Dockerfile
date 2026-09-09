FROM ubuntu:24.04
ARG RUST_VERSION=1.97.1
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl build-essential clang pkg-config python3 \
    libdbus-1-dev libpipewire-0.3-dev libspa-0.2-dev libei-dev \
    libxkbcommon-dev libx11-dev libxi-dev libxtst-dev libxext-dev \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh \
    && sh /tmp/rustup.sh -y --profile minimal --component rustfmt --default-toolchain "$RUST_VERSION" \
    && rm /tmp/rustup.sh
ENV PATH=/opt/cargo/bin:$PATH
WORKDIR /src/rust
