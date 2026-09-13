"""Identify Linux inputs that affect LibreOffice Impress export rendering.

The identity is intentionally limited to the executable, fonts/fontconfig,
rendering-backend selection and locale. A profile made from an incomplete Linux
observation must never be admitted.
"""
import hashlib
import locale
import os
import shutil
import subprocess
from pathlib import Path

SCHEMA = "libreoffice-impress-runtime-v1"
RENDERING_ENV = ("SAL_USE_VCLPLUGIN", "SAL_DISABLE_OPENGL", "SAL_FORCEGL",
                 "GDK_BACKEND", "QT_QPA_PLATFORM")
LOCALE_ENV = ("LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "LC_NUMERIC", "LC_TIME")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def file_hashes(paths):
    result = {}
    for path in sorted({Path(path).resolve() for path in paths if Path(path).is_file()}):
        result[str(path)] = digest(path)
    return result


def command(name, *args):
    executable = shutil.which(name)
    if not executable:
        raise ValueError(f"Required Linux runtime evidence is unavailable: {name}")
    return subprocess.check_output([executable, *args], text=True, timeout=30)


def font_files():
    files = [line for line in command("fc-list", "--format=%{file}\\n").splitlines() if line]
    if not files:
        raise ValueError("Required Linux runtime evidence is unavailable: font files")
    return file_hashes(files)


def font_config_files():
    roots = [Path("/etc/fonts"), Path("/usr/share/fontconfig"),
             Path.home() / ".config/fontconfig", Path.home() / ".fonts.conf"]
    if os.environ.get("FONTCONFIG_FILE"):
        roots.append(Path(os.environ["FONTCONFIG_FILE"]))
    if os.environ.get("FONTCONFIG_PATH"):
        roots.extend(Path(item) for item in os.environ["FONTCONFIG_PATH"].split(":"))
    files = []
    for root in roots:
        if root.is_file(): files.append(root)
        elif root.is_dir(): files.extend(path for path in root.rglob("*") if path.is_file())
    result = file_hashes(files)
    if not result:
        raise ValueError("Required Linux runtime evidence is unavailable: font configuration")
    return result


def runtime_identity(office):
    office = Path(office).resolve()
    if os.name != "posix" or not Path("/etc/os-release").is_file():
        raise ValueError("Linux runtime identity is required for an Impress scoring profile")
    if not office.is_file(): raise ValueError("LibreOffice executable is unavailable")
    soffice_bin = office.parent / "soffice.bin"
    if not soffice_bin.is_file():
        raise ValueError("Required Linux runtime evidence is unavailable: soffice.bin")
    merged = office.parent / "libmergedlo.so"
    plugins = file_hashes(office.parent.glob("libvclplug_*lo.so"))
    if not plugins:
        raise ValueError("Required Linux runtime evidence is unavailable: LibreOffice rendering backends")
    try: locale.setlocale(locale.LC_ALL, None)
    except locale.Error as error: raise ValueError("Required Linux runtime evidence is unavailable: locale") from error
    return {
        "schema": SCHEMA,
        "executable": {"path": str(office), "sha256": digest(office),
                       "version": subprocess.check_output([str(office), "--version"], text=True, timeout=10).strip(),
                       "sofficeBin": {"path": str(soffice_bin.resolve()), "sha256": digest(soffice_bin)},
                       "libmergedlo": ({"path": str(merged.resolve()), "sha256": digest(merged)}
                                       if merged.is_file() else None)},
        "fonts": {"files": font_files(), "configFiles": font_config_files(),
                  "environment": {key: os.environ.get(key) for key in ("FONTCONFIG_FILE", "FONTCONFIG_PATH")}},
        "rendering": {"environment": {key: os.environ.get(key) for key in RENDERING_ENV},
                      "display": {"x11Present": bool(os.environ.get("DISPLAY")),
                                  "waylandPresent": bool(os.environ.get("WAYLAND_DISPLAY"))},
                      "vclPlugins": plugins},
        "locale": {"environment": {key: os.environ.get(key) for key in LOCALE_ENV}, "effective": command("locale")},
    }
