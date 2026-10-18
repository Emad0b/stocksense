"""Fetch the exact public sample used by the experiment; refuse changed bytes."""

import hashlib
import json
import urllib.request
from pathlib import Path


def main():
    manifest = json.loads(Path("data/source.json").read_text())
    destination = Path("data/m5_sample.csv")
    if (
        destination.exists()
        and hashlib.sha256(destination.read_bytes()).hexdigest() == manifest["sha256"]
    ):
        print("Verified existing M5 sample.")
        return
    with urllib.request.urlopen(manifest["url"], timeout=60) as response:
        content = response.read(5_000_001)
    if (
        len(content) > 5_000_000
        or hashlib.sha256(content).hexdigest() != manifest["sha256"]
    ):
        raise ValueError("Downloaded sample does not match the recorded SHA-256")
    destination.write_bytes(content)
    print("Downloaded and verified public M5 sample.")


if __name__ == "__main__":
    main()
