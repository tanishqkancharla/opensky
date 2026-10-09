#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -s)" == Linux ]] || exit 2
apt_network=(-o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
sudo apt-get "${apt_network[@]}" update
sudo apt-get "${apt_network[@]}" install -y --no-install-recommends \
  xvfb xauth dbus-x11 openbox at-spi2-core xdotool x11-utils x11-xserver-utils \
  libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-gtk3 \
  fonts-liberation tesseract-ocr libpipewire-0.3-0 libei1 libxtst6
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
# Cache only the pinned download; verify every hit before installing fresh.
vscode_sha=2493226f723f66c8e83b9d806e3fbe83dcc43f381ece51eaa03d88889542b0c0
vscode_archive="${OPENSKY_VSCODE_DOWNLOAD_CACHE:-$scratch}/code.deb"
mkdir -p "$(dirname "$vscode_archive")"
if [[ ! -f "$vscode_archive" ]]; then
  curl --fail --location --retry 2 --retry-max-time 240 \
    --connect-timeout 30 --max-time 180 \
    'https://vscode.download.prss.microsoft.com/dbazure/download/stable/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/code_1.136.2-1788561671_amd64.deb' \
    --output "$scratch/code.deb.part"
  printf '%s  %s\n' "$vscode_sha" "$scratch/code.deb.part" | sha256sum --check -
  mv "$scratch/code.deb.part" "$vscode_archive"
fi
printf '%s  %s\n' "$vscode_sha" "$vscode_archive" | sha256sum --check -
printf 'code code/add-microsoft-repo boolean false\n' | sudo debconf-set-selections
sudo apt-get "${apt_network[@]}" install -y --no-install-recommends "$vscode_archive"
printf 'OPENSKY_EVAL_VSCODE=/usr/share/code\n' >> "$GITHUB_ENV"
