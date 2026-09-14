"""Hermes Agent plugin for song2html chord charts."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

PLUGIN_ROOT = Path(__file__).resolve().parent
TOOL_SCRIPT = PLUGIN_ROOT / "bin" / "song2html-tool.js"

SKILLS = (
    (
        "song2html",
        "skills/song2html/SKILL.md",
        "Read, write, parse, validate, import, transpose, and render song chord charts.",
    ),
    (
        "convert-chord-chart",
        "skills/convert-chord-chart/SKILL.md",
        "Convert chords-over-lyrics, ChordPro, or bracket charts into song2html.",
    ),
)

PARSE_FIELDS = ["html", "arrangements", "song", "errata", "ast"]
READ_FIELDS = ["source", *PARSE_FIELDS]
THEMES = ["print", "stage", "compact", "large-type", "dark"]
IMPORT_FORMATS = [
    "auto",
    "chordpro",
    "inline-brackets",
    "opensong",
    "chords-over-lyrics",
    "song2html",
]


def _node_bin() -> Optional[str]:
    return shutil.which("node")


def invoke_tool(name: str, params: Optional[Mapping[str, Any]] = None, *, library_root: Optional[str] = None) -> str:
    """Run one song2html tool via Node and return the text payload or an error JSON object."""
    node = _node_bin()
    if node is None:
        return json.dumps({"error": "Node.js >= 20 is required on PATH. See after-install.md."})
    if not TOOL_SCRIPT.is_file():
        return json.dumps({"error": f"Missing tool runner: {TOOL_SCRIPT}"})

    env = os.environ.copy()
    env["SONG2HTML_PLUGIN_ROOT"] = str(PLUGIN_ROOT)
    if library_root and "SONG2HTML_LIBRARY_ROOT" not in env:
        env["SONG2HTML_LIBRARY_ROOT"] = library_root

    try:
        proc = subprocess.run(
            [node, str(TOOL_SCRIPT), name],
            input=json.dumps(params or {}),
            capture_output=True,
            text=True,
            cwd=str(PLUGIN_ROOT),
            env=env,
            timeout=60,
            check=False,
        )
    except FileNotFoundError:
        return json.dumps({"error": "Node.js >= 20 is required on PATH. See after-install.md."})
    except subprocess.TimeoutExpired:
        return json.dumps({"error": f"song2html tool {name!r} timed out after 60s"})

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode == 0:
        return stdout or json.dumps({"ok": True})
    if stderr:
        try:
            parsed = json.loads(stderr)
            if isinstance(parsed, dict) and parsed.get("error"):
                return json.dumps(parsed)
        except json.JSONDecodeError:
            pass
        return json.dumps({"error": stderr, "tool": name})
    return json.dumps({"error": stdout or f"song2html tool {name!r} failed", "tool": name})


def _handler(tool_name: str, library_root: Optional[str]):
    def handle(params=None, **kwargs):
        del kwargs
        return invoke_tool(tool_name, params or {}, library_root=library_root)

    handle.__name__ = f"handle_{tool_name}"
    return handle


def _register_skill(ctx, name: str, relative: str, description: str) -> None:
    path = PLUGIN_ROOT / relative
    try:
        ctx.register_skill(name, path, description)
    except TypeError:
        ctx.register_skill(name, path)


TOOLS = (
    (
        "parse_song",
        "Parse song2html source text and return metadata, HTML, arrangements, and errata.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "The raw song2html source text"},
                "arrangement": {"type": "string", "description": "Optional arrangement name to render"},
                "include": {
                    "type": "array",
                    "items": {"type": "string", "enum": PARSE_FIELDS},
                    "description": "Result fields to include; defaults to compatibility fields",
                },
            },
            "required": ["source"],
        },
    ),
    (
        "validate_song",
        "Validate song2html source text and return errors or warnings without generating full HTML.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "The raw song2html source text"},
            },
            "required": ["source"],
        },
    ),
    (
        "create_song",
        "Generate song2html source text from structured title, chords, sections, and arrangements.",
        {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Song title"},
                "key": {"type": "string", "description": "Musical key (e.g. G, F#, Bbm)"},
                "author": {"type": "string", "description": "Comma-separated author names"},
                "tempo": {"type": "number", "description": "BPM"},
                "time": {"type": "string", "description": "Time signature (e.g. 4/4, 3/4)"},
                "owner": {"type": "string", "description": "Copyright owner"},
                "license": {"type": "string", "description": "License identifier or name"},
                "chords": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                    "description": "Map of section type to chord progression",
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "lyrics": {"type": "array", "items": {"type": "string"}},
                            "transpose": {"type": "number"},
                        },
                        "required": ["name", "lyrics"],
                    },
                    "description": "Ordered lyric sections with caret markers",
                },
                "arrangements": {
                    "type": "object",
                    "additionalProperties": {"type": "array", "items": {"type": "string"}},
                    "description": "Named arrangements mapping to arrays of section names",
                },
            },
            "required": ["title", "chords", "sections"],
        },
    ),
    (
        "read_song_file",
        "Read a song file from disk, parse it, and return source plus structured metadata.",
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the song file"},
                "arrangement": {"type": "string", "description": "Optional arrangement name"},
                "include": {
                    "type": "array",
                    "items": {"type": "string", "enum": READ_FIELDS},
                    "description": "Result fields to include; defaults to compatibility fields",
                },
            },
            "required": ["path"],
        },
    ),
    (
        "write_song_file",
        "Validate and write song2html source text to disk.",
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to write the song file"},
                "source": {"type": "string", "description": "The song2html source text to write"},
                "allowInvalid": {"type": "boolean", "description": "Write despite error-severity diagnostics"},
                "overwrite": {"type": "boolean", "description": "Replace an existing file"},
                "dryRun": {"type": "boolean", "description": "Validate without writing"},
            },
            "required": ["path", "source"],
        },
    ),
    (
        "list_song_files",
        "Scan a directory for song files and return title, key, and author summaries.",
        {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Absolute path to the directory to scan"},
            },
            "required": ["directory"],
        },
    ),
    (
        "transpose_song",
        "Transpose named chords by N half steps. Nashville numbers follow the song key.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "The song2html source text"},
                "steps": {"type": "number", "description": "Half steps to transpose (positive = up)"},
            },
            "required": ["source", "steps"],
        },
    ),
    (
        "detect_format",
        "Rank supported external chart formats with confidence and evidence.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "Source chart text to inspect"},
            },
            "required": ["source"],
        },
    ),
    (
        "import_song",
        "Deterministically import ChordPro, inline brackets, OpenSong, chords-over-lyrics, or song2html.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "Source chart text"},
                "format": {"type": "string", "enum": IMPORT_FORMATS, "description": "Importer to use; default auto"},
                "sourceName": {"type": "string", "description": "Original filename or provenance label"},
                "title": {"type": "string", "description": "Title override for formats without metadata"},
                "key": {"type": "string", "description": "Key override for formats without metadata"},
                "align": {
                    "type": "string",
                    "enum": ["word", "column"],
                    "description": "Chords-over-lyrics caret alignment; default word",
                },
                "includeOriginalMapping": {
                    "type": "boolean",
                    "description": "Include source-line to imported-event mapping",
                },
            },
            "required": ["source"],
        },
    ),
    (
        "preview_song",
        "Render compact [Chord]lyric text for checking caret placement.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "The raw song2html source text"},
            },
            "required": ["source"],
        },
    ),
    (
        "render_html",
        "Render a standalone HTML page with embedded styles.",
        {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "The raw song2html source text"},
                "arrangement": {"type": "string", "description": "Optional arrangement name"},
                "theme": {"type": "string", "enum": THEMES, "description": "Built-in rendering theme"},
                "language": {"type": "string", "description": "BCP 47 document language (defaults to en)"},
            },
            "required": ["source"],
        },
    ),
)


def _convert_chord_chart(raw_args: str) -> str:
    extra = (raw_args or "").strip()
    lines = [
        "Follow the convert-chord-chart skill.",
        "Call detect_format, then import_song, then preview_song before rewriting a chart by hand.",
        "Use validate_song before write_song_file. Prefer .s2h beside the original chart.",
    ]
    if extra:
        lines.extend(["", "User input:", extra])
    return "\n".join(lines)


def register(ctx) -> None:
    """Register song2html skills, slash command, and Node-backed tools."""
    library_root = None
    try:
        value = ctx.get_config("library_root")
        if isinstance(value, str) and value.strip():
            library_root = value.strip()
    except Exception:
        library_root = None

    for name, relative, description in SKILLS:
        try:
            _register_skill(ctx, name, relative, description)
        except Exception as exc:
            logger.warning("song2html skill %s skipped: %s", name, exc)

    try:
        ctx.register_command(
            name="convert-chord-chart",
            handler=_convert_chord_chart,
            description="Convert a chord chart into song2html format.",
            args_hint="<chart or path>",
        )
    except Exception as exc:
        logger.warning("song2html slash command skipped: %s", exc)

    for name, description, parameters in TOOLS:
        schema = {"name": name, "description": description, "parameters": parameters}
        try:
            ctx.register_tool(
                name=name,
                toolset="song2html",
                schema=schema,
                handler=_handler(name, library_root),
                description=description,
            )
        except Exception as exc:
            logger.warning("song2html tool %s skipped: %s", name, exc)

    logger.info("song2html Hermes plugin registered")
