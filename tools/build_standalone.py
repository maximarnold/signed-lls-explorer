#!/usr/bin/env python3
"""Build a self-contained HTML app and a reproducible collaborator ZIP."""

from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile


PACKAGE_NAME = "Signed-LLS-Explorer"
ARCHIVE_NAME = "signed-lls-explorer-standalone.zip"
SOURCE_SUFFIXES = {".html", ".css", ".js"}


class TagAttributes(HTMLParser):
    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self.attrs: dict[str, str | None] = {}
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.attrs = dict(attrs)


class StandaloneAudit(HTMLParser):
    """Check that runtime assets are embedded and scripts follow the DOM."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.script_sources: list[str] = []
        self.body_closed = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "script":
            if "src" in attrs:
                raise ValueError("Standalone HTML still has a script source dependency.")
            if "plot" not in self.ids or self.body_closed:
                raise ValueError("Inline scripts must execute after the application DOM, inside body.")
            self.script_sources.append(attrs.get("data-source", "inline"))
        if tag == "link" and "href" in attrs:
            raise ValueError("Standalone HTML still has a linked resource dependency.")
        if tag == "base":
            raise ValueError("Standalone HTML cannot depend on a base URL.")
        for attribute in ("src", "poster", "srcset"):
            if attribute in attrs and not str(attrs[attribute]).startswith("data:"):
                raise ValueError(f"Standalone HTML contains a non-embedded {tag} {attribute}.")
        if tag in {"iframe", "object", "embed"}:
            raise ValueError(f"Standalone HTML cannot contain an external {tag} resource.")

    def handle_endtag(self, tag):
        if tag == "body":
            self.body_closed = True


def local_asset(dist: Path, reference: str, suffix: str) -> Path:
    if not reference or any(character in reference for character in (":", "?", "#", "\\")):
        raise ValueError(f"Expected a simple local asset path, received {reference!r}.")
    path = dist / reference
    if path.is_symlink() or not path.is_file() or path.suffix != suffix:
        raise ValueError(f"Missing or unsupported asset: {reference}")
    if not path.resolve().is_relative_to(dist.resolve()):
        raise ValueError("An asset path escapes dist/.")
    if any(part.startswith(".") for part in Path(reference).parts):
        raise ValueError("Hidden files are not standalone assets.")
    return path


def escape_closing_tag(source: str, tag: str) -> str:
    # In JavaScript/CSS string contents, \/ has the same value as /; in
    # comments this is inert. It prevents HTML raw-text parsing from closing
    # an embedded block before its real closing tag.
    return re.sub(r"</" + tag, lambda match: "<\\/" + match.group(0)[2:], source, flags=re.I)


def standalone_html(dist: Path) -> str:
    document = (dist / "index.html").read_text(encoding="utf-8")
    scripts: list[tuple[str, str]] = []

    def replace_link(match):
        attrs = TagAttributes(match.group(0)).attrs
        if attrs.get("rel", "").lower() != "stylesheet":
            raise ValueError("Only local stylesheet links are supported by the standalone builder.")
        reference = attrs.get("href", "")
        css = local_asset(dist, reference, ".css").read_text(encoding="utf-8")
        if re.search(r"@import\b", css, flags=re.I):
            raise ValueError("Stylesheets must not import additional resources.")
        for url in re.findall(r"url\(\s*([^)]*?)\s*\)", css, flags=re.I):
            if not url.strip("\"'").startswith(("data:", "#")):
                raise ValueError("Stylesheet URLs must be embedded data or local fragment references.")
        return f'<style data-source="{html.escape(reference, quote=True)}">\n{escape_closing_tag(css, "style")}\n</style>'

    def collect_script(match):
        attrs = TagAttributes("<script" + match.group("attrs") + ">").attrs
        if attrs.get("type", "").lower() not in {"", "text/javascript", "application/javascript"}:
            raise ValueError("The standalone builder supports classic JavaScript scripts only.")
        if "src" in attrs:
            if match.group("body").strip():
                raise ValueError("A source script tag must not also contain inline JavaScript.")
            reference = attrs["src"]
            source = local_asset(dist, reference, ".js").read_text(encoding="utf-8")
        else:
            reference, source = "inline", match.group("body")
        if re.search(r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(", source):
            raise ValueError(f"Review network-dependent code before bundling {reference} for offline use.")
        scripts.append((reference, source))
        return ""

    document = re.sub(r"<link\b[^>]*>", replace_link, document, flags=re.I)
    document = re.sub(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>",
                      collect_script, document, flags=re.I | re.S)
    if not scripts:
        raise ValueError("No application scripts were found.")
    if len(re.findall(r"</body\s*>", document, flags=re.I)) != 1:
        raise ValueError("Expected exactly one closing body tag.")
    embedded = "\n<!-- All application scripts are embedded below the DOM, in source order. -->\n"
    embedded += "\n".join(
        f'<script data-source="{html.escape(reference, quote=True)}">\n{escape_closing_tag(source, "script")}\n</script>'
        for reference, source in scripts
    )
    document = re.sub(r"</body\s*>", lambda _: embedded + "\n</body>", document, count=1, flags=re.I)
    audit = StandaloneAudit()
    audit.feed(document)
    if audit.script_sources != [reference for reference, _ in scripts]:
        raise ValueError("Embedded script order does not match the source application.")
    return document


def collect_files(root: Path) -> dict[str, bytes]:
    dist = root / "dist"
    files: dict[str, bytes] = {"index.html": standalone_html(dist).encode("utf-8")}
    guide = root / "STANDALONE.md"
    if not guide.is_file():
        guide = root / "README.md"  # Rebuilding from an extracted package.
    files["README.md"] = guide.read_bytes()
    developer = root / "DEVELOPER.md"
    if not developer.is_file() and (root / "STANDALONE.md").is_file():
        developer = root / "README.md"  # Original source layout.
    if developer.is_file():
        files["DEVELOPER.md"] = developer.read_text(encoding="utf-8").replace("STANDALONE.md", "README.md").encode("utf-8")

    for path in sorted(dist.rglob("*")):
        relative = path.relative_to(root)
        if (path.is_file() and not path.is_symlink() and path.suffix in SOURCE_SUFFIXES
                and not any(part.startswith(".") for part in relative.parts)):
            files[relative.as_posix()] = path.read_bytes()
    for directory, pattern in (("tests", "*.test.js"), ("examples", "*.txt")):
        for path in sorted((root / directory).glob(pattern)):
            if path.is_file() and not path.is_symlink():
                files[path.relative_to(root).as_posix()] = path.read_bytes()
    files["tools/build_standalone.py"] = Path(__file__).read_bytes()

    forbidden = re.compile(rb"(?:appgprj_|appgdep_)[a-z0-9]{8,}|(?:siwc_bypass_bearer_token|source_repository_credential)[\"']?\s*[:=]")
    for name, contents in files.items():
        if forbidden.search(contents):
            raise ValueError(f"Hosting identity or credential metadata must not enter the package: {name}")
    checksums = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items()))
    files["SHA256SUMS.txt"] = checksums.encode("utf-8")
    return files


def build(output_dir: Path) -> dict[str, str | int]:
    if not output_dir.is_absolute():
        raise ValueError("--output-dir must be an absolute path.")
    root = Path(__file__).resolve().parents[1]
    output_dir = output_dir.resolve()
    if any(output_dir.is_relative_to(root / name) for name in ("dist", "tests", "tools", "examples")):
        raise ValueError("Choose an output directory outside the source asset and test directories.")
    output_dir.mkdir(parents=True, exist_ok=True)
    stage = output_dir / PACKAGE_NAME
    archive = output_dir / ARCHIVE_NAME
    if stage.is_symlink() or (stage.exists() and not stage.is_dir()):
        raise ValueError("The package staging path must be an ordinary directory.")
    if archive.is_symlink():
        raise ValueError("The ZIP output must not be a symlink.")

    files = collect_files(root)
    with tempfile.TemporaryDirectory(prefix="lls-build-", dir=output_dir) as temporary:
        temporary = Path(temporary)
        temporary_stage = temporary / PACKAGE_NAME
        for name, contents in sorted(files.items()):
            path = temporary_stage / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
        temporary_archive = temporary / ARCHIVE_NAME
        with zipfile.ZipFile(temporary_archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
            for name, contents in sorted(files.items()):
                entry = zipfile.ZipInfo(PACKAGE_NAME + "/" + name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                package.writestr(entry, contents, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(temporary_archive) as package:
            if package.testzip() is not None:
                raise ValueError("ZIP integrity verification failed.")
        if stage.exists():
            shutil.rmtree(stage)
        temporary_stage.replace(stage)
        temporary_archive.replace(archive)
    return {
        "archive": str(archive), "directory": str(stage),
        "html": str(stage / "index.html"), "file_count": len(files),
        "size_bytes": archive.stat().st_size,
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="Absolute directory for the ZIP and extracted package.")
    arguments = parser.parse_args()
    try:
        print(json.dumps(build(arguments.output_dir), indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Standalone build failed: {error}\n")


if __name__ == "__main__":
    main()
