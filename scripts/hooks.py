"""MkDocs hooks: runnable code blocks, "Open in Notebook" and the prepared Freva parts (.prepared/)."""

from __future__ import annotations

import hashlib
import html
import json
import os
import posixpath
import re
import shutil
from pathlib import Path
from urllib.parse import quote, urlsplit

from mkdocs.utils import get_relative_url

FENCE = re.compile(r"^(?P<indent>[ \t]*)(?P<fence>`{3,}|~{3,})\s*\{(?P<attrs>[^}]*\btry-in-python\b[^}]*)\}\s*$")
TITLE = re.compile(r'title\s*=\s*"([^"]*)"')
HIGHLIGHT = re.compile(
    r'<div class="[^"]*\bhighlight\b[^"]*"(?P<attrs>[^>]*)>(?:<span class="filename">(?P<title>.*?)</span>)?'
    r"<pre(?: [^>]*)?><span></span><code>(?P<code>.*?)</code></pre></div>",
    re.S,
)
EXAMPLE_ATTR = re.compile(r'data-wp-example="([^"]*)"')
LINE_ANCHOR = re.compile(r'<a id="__codelineno-[^"]*"[^>]*></a>')
ROOT_HREF = re.compile(r'href="/(?!/)([^"]*)"')
NOTEBOOK_LINK = re.compile(r'<a\b([^>]*?)\sdata-wp-notebook="lab"([^>]*)>(.*?)</a>', re.S)

_state: dict = {"manifest": None, "prepared": None, "pages": {}}


def on_config(config):
    prepared = Path(os.environ.get("WATERPARK_PREPARED", Path(config["config_file_path"]).parent / ".prepared"))
    manifest = prepared / "manifest.json"
    _state.update(prepared=prepared, pages={}, manifest=json.loads(manifest.read_text()) if manifest.exists() else None)
    return config


def on_page_markdown(markdown, page, config, files):
    lines = markdown.split("\n")
    stem = posixpath.splitext(page.file.src_uri)[0]
    examples = []
    i = 0
    while i < len(lines):
        match = FENCE.match(lines[i])
        end = i + 1
        if match:
            indent, fence = match["indent"], match["fence"]
            closing = re.compile(rf"^{re.escape(indent)}{re.escape(fence[0])}{{{len(fence)},}}\s*$")
            while end < len(lines) and not closing.match(lines[end]):
                end += 1
            source = "\n".join(line[len(indent):] for line in lines[i + 1:end])
            example_id = f"{stem}#{len(examples) + 1}"
            named = TITLE.search(match["attrs"])
            examples.append({
                "id": example_id,
                "title": named.group(1) if named else f"{page.title or stem} · block {len(examples) + 1}",
                "source": source,
                "sha256": hashlib.sha256(source.encode()).hexdigest(),
            })
            lines[i] = f'{indent}{fence}{{ {match["attrs"].strip()} data-wp-example="{example_id}" }}'
            end += 1
        i = end
    _state["pages"][page.file.src_uri] = examples
    return "\n".join(lines)


def _figure(example, title, code):
    esc = lambda text: html.escape(text, quote=True)  # noqa: E731
    head = f'<span class="portal-code-title">{esc(title)}</span>' if title else ""
    return (
        '<div class="portal-code-figure" data-portal-code="python" data-portal-editable>'
        f'<div class="portal-code-head">{head}<span class="portal-code-lang{" portal-code-lang-secondary" if title else ""}">Python</span>'
        f'<div class="portal-code-actions"><button type="button" class="portal-code-copy" data-portal-copy="{esc(example["source"])}" '
        'aria-label="Copy code" hidden><span class="portal-code-copy-icon" aria-hidden="true"></span>'
        '<span class="portal-code-copy-label">Copy</span></button><button type="button" class="portal-code-run" '
        f'data-portal-run data-portal-example="{esc(example["id"])}" data-portal-digest="{example["sha256"]}" '
        'aria-label="Try this code in Python" hidden><span class="portal-code-run-icon" aria-hidden="true"></span>'
        '<span class="portal-code-run-label">Try in Python</span></button></div></div>'
        '<pre class="portal-code-block" data-portal-language="python"><code class="portal-code" data-portal-language="python">'
        f'{LINE_ANCHOR.sub("", code).rstrip(chr(10))}</code></pre></div>'
    )


def _notebook_control(manifest, base, seed, foot):
    logo = manifest["jupyterLogo"]
    href = html.escape(f"{base}/{manifest['app']['notebook']['lab']}?example={quote(seed, safe='')}", quote=True)
    images = "".join(
        f'<img class="portal-jupyter-logo" data-variant="{v}" src="{html.escape(logo[v], quote=True)}" alt="" width="14" height="16" />'
        for v in ("light", "dark")
    )
    control = (
        f'<a class="portal-document-notebook" href="{href}" data-portal-document-notebook{"-foot" if foot else ""}>'
        f'<span class="portal-document-notebook-launch">{images}Open in</span>'
        '<span class="portal-document-notebook-target">Notebook</span></a>'
    )
    return f'<div class="portal-document-notebook-foot">{control}</div>' if foot else control


def on_page_content(output, page, config, files):
    manifest = _state["manifest"]
    if not manifest:
        return NOTEBOOK_LINK.sub("", output)
    examples = {e["id"]: e for e in _state["pages"].get(page.file.src_uri, [])}

    def figure(match):
        found = EXAMPLE_ATTR.search(match["attrs"])
        example = examples.get(found.group(1)) if found else None
        if not example:
            return match.group(0)
        return _figure(example, html.unescape(match["title"]) if match["title"] else None, match["code"])

    output = HIGHLIGHT.sub(figure, output)
    base = get_relative_url(".", page.url).rstrip("/") or "."
    seed = f"{posixpath.splitext(page.file.src_uri)[0]}.ipynb"
    if seed in manifest["app"]["notebook"]["seeds"]:
        output = re.sub(r"(<h1\b)", _notebook_control(manifest, base, seed, False) + r"\1", output, count=1)
        output += _notebook_control(manifest, base, seed, True)
    lab = html.escape(f"{base}/{manifest['app']['notebook']['lab']}", quote=True)
    return NOTEBOOK_LINK.sub(lambda m: f'<a{m[1]} href="{lab}"{m[2]}>{m[3]}</a>', output)


def _site_context(context, base, page=None):
    manifest = _state["manifest"]
    context["wp_site"] = None
    context["wp_playground"] = None
    if not manifest:
        return context
    site = {key: manifest[key] for key in ("app", "tree", "playground")}
    context["wp_site"] = json.dumps({**site, "base": base}).replace("<", "\\u003c")
    context["wp_ui_css"] = f"{base}/{manifest['app']['ui']}"
    context["wp_site_script"] = f"{base}/{manifest['app']['site']}"
    examples = _state["pages"].get(page.file.src_uri) if page else None
    if examples:
        seed = f"{posixpath.splitext(page.file.src_uri)[0]}.ipynb"
        notebook = {"notebook": seed} if seed in manifest["app"]["notebook"]["seeds"] else {}
        registered = [{"id": e["id"], "sha256": e["sha256"], "title": e["title"], **notebook} for e in examples]
        context["wp_playground"] = html.escape(json.dumps({**manifest["playground"], "examples": registered}), quote=True)
    return context


def on_page_context(context, page, config, nav):
    return _site_context(context, get_relative_url(".", page.url).rstrip("/") or ".", page)


def on_template_context(context, template_name, config):
    return _site_context(context, (urlsplit(config["site_url"] or "/").path or "/").rstrip("/"))


def on_post_page(output, page, config):
    return ROOT_HREF.sub(lambda m: f'href="{get_relative_url(m[1] or ".", page.url)}"', output)


def on_post_template(output, template_name, config):
    base = (urlsplit(config["site_url"] or "/").path or "/").rstrip("/")
    return ROOT_HREF.sub(lambda m: f'href="{base}/{m[1]}"', output) if template_name == "404.html" else output


def on_post_build(config):
    if _state["manifest"]:
        for part in ("app", "notebook"):
            shutil.copytree(_state["prepared"] / part, Path(config["site_dir"]) / part, dirs_exist_ok=True)
