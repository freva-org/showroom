"""
mkdocs hook: append a content digest to every local extra_css and
extra_javascript entry.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def content_hash(path: Path, length: int = 8) -> str:
    """Short sha256 of a file's bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:length]


def _bust(entry: Any, docs_dir: Path) -> Any:
    """
    Return the entry with ``?h=<digest>`` appended, or unchanged.
    """
    path_attr = None if isinstance(entry, str) else getattr(entry, "path", None)
    raw = entry if isinstance(entry, str) else path_attr
    if not isinstance(raw, str):
        return entry
    if raw.startswith(("http://", "https://", "//")) or "?" in raw:
        return entry

    target = docs_dir / raw
    if not target.is_file():
        return entry

    busted = f"{raw}?h={content_hash(target)}"
    if path_attr is None:
        return busted
    entry.path = busted
    return entry


def on_config(config: Any, **_: Any) -> Any:
    docs_dir = Path(config["docs_dir"])
    for key in ("extra_css", "extra_javascript"):
        config[key] = [_bust(e, docs_dir) for e in config[key]]
    return config
