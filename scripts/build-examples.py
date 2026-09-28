#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"
FIGURES = ROOT / "assets" / "examples"
PAGES = ROOT / "content" / "examples"
INDEX = PAGES / "index.md"
START = '[//]: # "examples-cards:start"'
END = '[//]: # "examples-cards:end"'
SECTION = re.compile(r"^#\s*%%\s*(?:\[(?P<kind>\w+)\])?\s*$")
THUMB_SIZE = (800, 500)
LINKS = {
    "](../high-level-access.md)": "](../tips-and-tricks/working-with-data.md)",
    "](../storage_concepts/": "](../storage-concepts/",
}
TIP = [
    ":::tip[Run it here]",
    "Every code block on this page has a **Try in Python** button. The blocks share one",
    "Python session, like notebook cells, so run them in order from the top. `healpix-geo`",
    "is already installed there. You can edit a block and run it again; **Reset** brings",
    "the original back.",
    ":::",
    "",
]


@dataclass
class Example:
    path: Path
    title: str
    lead: str
    blocks: list[tuple[str, str]]

    @property
    def stem(self) -> str:
        return self.path.stem

    @property
    def figure(self) -> Path:
        return FIGURES / f"{self.stem}.png"

    @property
    def thumbnail(self) -> Path:
        return FIGURES / f"{self.stem}-thumb.png"

    @property
    def summary(self) -> str:
        return self.lead.split("\n\n")[0].replace("\n", " ").strip()

    @property
    def description(self) -> str:
        text = ""
        for sentence in re.split(r"(?<=[.!?])\s+", self.summary):
            if len(text) + len(sentence) + 1 > 300:
                break
            text = f"{text} {sentence}".strip()
        return text or self.summary[:297] + "..."


def uncomment(text: str) -> str:
    out = []
    for line in text.splitlines():
        if line.startswith("# "):
            out.append(line[2:])
        elif line.strip() == "#":
            out.append("")
        else:
            out.append(line)
    return "\n".join(out).strip("\n")


def parse(path: Path) -> Example:
    source = path.read_text()
    stripped = source.lstrip()
    if not stripped.startswith('"""'):
        raise SystemExit(f"{path.name}: an example must start with a module docstring")
    start = len(source) - len(stripped) + 3
    end = source.index('"""', start)
    doc = source[start:end].strip("\n").splitlines()
    title = doc[0].strip()
    lead = textwrap.dedent("\n".join(doc[1:])).strip()

    blocks: list[tuple[str, str]] = []
    kind, buffer = "code", []

    def flush() -> None:
        text = "\n".join(buffer).strip("\n")
        buffer.clear()
        if text:
            blocks.append((kind, uncomment(text) if kind == "md" else text))

    for line in source[end + 3 :].splitlines():
        match = SECTION.match(line)
        if not match:
            buffer.append(line)
            continue
        flush()
        kind = match.group("kind") or "code"
        if kind == "figure":
            blocks.append(("figure", ""))
            kind = "code"
        elif kind not in {"md", "code"}:
            raise SystemExit(f"{path.name}: unknown block kind {kind!r}")
    flush()
    return Example(path, title, lead, blocks)


def discover() -> list[Example]:
    return [parse(p) for p in sorted(EXAMPLES.glob("[0-9][0-9]_*.py"))]


def yaml_str(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render_page(example: Example) -> str:
    parts = [
        "---",
        f"title: {yaml_str(example.title)}",
        f"description: {yaml_str(example.description)}",
        "---",
        "",
        example.lead,
        "",
        *TIP,
    ]
    for kind, text in example.blocks:
        if kind == "md":
            for old, new in LINKS.items():
                text = text.replace(old, new)
            parts += [text, ""]
        elif kind == "code":
            parts += ["```python try-in-python", text, "```", ""]
        elif example.figure.exists():
            parts += [
                f"![{example.title}](../../assets/examples/{example.figure.name})",
                "/// caption",
                example.title,
                "///",
                "",
            ]
    parts += [
        "---",
        "",
        f"Prefer your own machine? Download [`{example.path.name}`](/downloads/examples/{example.path.name})"
        " and [`requirements.txt`](/downloads/examples/requirements.txt).",
        "",
    ]
    return "\n".join(parts)


def render_cards(examples: list[Example]) -> str:
    cards = []
    for example in examples:
        image = example.thumbnail if example.thumbnail.exists() else example.figure
        thumb = (
            f"[![](../../assets/examples/{image.name})](./{example.stem}.md)\n\n    "
            if image.exists()
            else ""
        )
        cards.append(
            f"-   {thumb}**[{example.title}](./{example.stem}.md)**\n\n"
            f"    {example.summary}\n"
        )
    return '<div class="grid cards cols-2" markdown>\n\n' + "\n".join(cards) + "\n</div>"


def render(examples: list[Example]) -> None:
    PAGES.mkdir(parents=True, exist_ok=True)
    expected = {f"{e.stem}.md" for e in examples} | {"index.md"}
    for stale in PAGES.glob("*.md"):
        if stale.name not in expected:
            stale.unlink()
    for example in examples:
        (PAGES / f"{example.stem}.md").write_text(render_page(example))
    index = INDEX.read_text()
    if START not in index or END not in index:
        raise SystemExit(f"{INDEX} needs the two lines {START} and {END}")
    head, rest = index.split(START, 1)
    _, tail = rest.split(END, 1)
    INDEX.write_text(f"{head}{START}\n\n{render_cards(examples)}\n\n{END}{tail}")
    print(f"[examples] wrote {len(examples)} pages and the gallery")


def make_thumbnail(example: Example) -> None:
    from PIL import Image

    with Image.open(example.figure) as image:
        figure = image.convert("RGB")
    margin = 16
    box = (THUMB_SIZE[0] - 2 * margin, THUMB_SIZE[1] - 2 * margin)
    scale = min(box[0] / figure.width, box[1] / figure.height)
    fitted = figure.resize(
        (max(1, round(figure.width * scale)), max(1, round(figure.height * scale))), Image.LANCZOS
    )
    canvas = Image.new("RGB", THUMB_SIZE, "white")
    canvas.paste(fitted, ((THUMB_SIZE[0] - fitted.width) // 2, (THUMB_SIZE[1] - fitted.height) // 2))
    canvas.save(example.thumbnail, optimize=True)


def run(examples: list[Example]) -> int:
    FIGURES.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "MPLBACKEND": "Agg"}
    failures = 0
    for example in examples:
        print(f"[examples] running {example.path.name}", flush=True)
        with tempfile.TemporaryDirectory(prefix="examples-") as scratch:
            shutil.copy2(example.path, Path(scratch) / example.path.name)
            result = subprocess.run([sys.executable, example.path.name], cwd=scratch, env=env)
            produced = sorted(Path(scratch).glob("*.png"))
            if result.returncode != 0 or len(produced) != 1:
                print(f"[examples] {example.path.name} failed", file=sys.stderr)
                failures += 1
                continue
            shutil.copy2(produced[0], example.figure)
        make_thumbnail(example)
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="examples/*.py -> content/examples/*.md")
    parser.add_argument("--run", action="store_true", help="run the examples and refresh their figures")
    args = parser.parse_args()
    examples = discover()
    if args.run:
        return run(examples)
    render(examples)
    return 0


if __name__ == "__main__":
    sys.exit(main())
