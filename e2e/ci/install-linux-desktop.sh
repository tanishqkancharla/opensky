#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -s)" == Linux ]] || exit 2
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  xvfb xauth dbus-x11 openbox at-spi2-core xdotool x11-utils x11-xserver-utils \
  libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-gtk3 \
  fonts-liberation tesseract-ocr libpipewire-0.3-0 libei1 libxtst6
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
# Exact Microsoft release already used by the remote desktop setup checks.
curl --fail --location --retry 2 \
  'https://vscode.download.prss.microsoft.com/dbazure/download/stable/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/code_1.136.2-1788561671_amd64.deb' \
  --output "$scratch/code.deb"
printf '2493226f723f66c8e83b9d806e3fbe83dcc43f381ece51eaa03d88889542b0c0  %s\n' "$scratch/code.deb" | sha256sum --check -
printf 'code code/add-microsoft-repo boolean false\n' | sudo debconf-set-selections
sudo apt-get install -y --no-install-recommends "$scratch/code.deb"
printf 'OPENSKY_EVAL_VSCODE=/usr/share/code\n' >> "$GITHUB_ENV"
