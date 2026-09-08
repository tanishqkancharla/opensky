"""Fetch missing original benchmark assets, verifying every published pin."""
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / "manifest.json").read_text())
downloaded = 0
for task in manifest["tasks"]:
    for asset in task["assets"]:
        path = ROOT / task["id"] / asset["file"]
        if path.is_file():
            if hashlib.sha256(path.read_bytes()).hexdigest() != asset["sha256"]:
                raise ValueError(f"Existing benchmark asset changed: {path}")
            continue
        url = asset.get("url")
        if not url or not url.startswith("https://"):
            raise ValueError(f"Missing committed asset without a download URL: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with urllib.request.urlopen(url, timeout=60) as response, tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
                temporary = Path(output.name)
                digest = hashlib.sha256()
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > 128 * 1024 * 1024:
                        raise ValueError("Benchmark asset exceeds the 128 MiB download limit")
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != asset["sha256"]:
                raise ValueError(f"Downloaded asset does not match its pin: {path.name}")
            temporary.replace(path)
            temporary = None
            downloaded += 1
            print(f"Verified {task['id']}/{asset['file']}", flush=True)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
print(f"All {sum(len(task['assets']) for task in manifest['tasks'])} assets verified; {downloaded} downloaded")
