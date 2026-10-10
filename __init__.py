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
        "Write, validate, import, transpose, and render song chord charts.",
    ),
    (
        "convert-chord-chart",
        "skills/convert-chord-chart/SKILL.md",
        "Convert chords-over-lyrics, ChordPro, or bracket charts into song2html.",
    ),
)

# Tool names, descriptions, and JSON schemas shared with the MCP server.
TOOLS = tuple(
    (tool["name"], tool["description"], tool["inputSchema"])
    for tool in json.loads((PLUGIN_ROOT / "tools.json").read_text(encoding="utf-8"))
)


def _node_bin() -> Optional[str]:
    return shutil.which("node")


def invoke_tool(name: str, params: Optional[Mapping[str, Any]] = None) -> str:
    """Run one song2html tool via Node and return the text payload or an error JSON object."""
    node = _node_bin()
    if node is None:
        return json.dumps({"error": "Node.js >= 20 is required on PATH. See after-install.md."})
    if not TOOL_SCRIPT.is_file():
        return json.dumps({"error": f"Missing tool runner: {TOOL_SCRIPT}"})

    env = os.environ.copy()
    env["SONG2HTML_PLUGIN_ROOT"] = str(PLUGIN_ROOT)

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


def _handler(tool_name: str):
    def handle(params=None, **kwargs):
        del kwargs
        return invoke_tool(tool_name, params or {})

    handle.__name__ = f"handle_{tool_name}"
    return handle


def _register_skill(ctx, name: str, relative: str, description: str) -> None:
    path = PLUGIN_ROOT / relative
    try:
        ctx.register_skill(name, path, description)
    except TypeError:
        ctx.register_skill(name, path)


def _convert_chord_chart(raw_args: str) -> str:
    extra = (raw_args or "").strip()
    lines = [
        "Follow the convert-chord-chart skill.",
        "Call import_song, then preview_song, before rewriting a chart by hand.",
        "Call validate_song until it reports no errors.",
    ]
    if extra:
        lines.extend(["", "User input:", extra])
    return "\n".join(lines)


def register(ctx) -> None:
    """Register song2html skills, slash command, and Node-backed tools."""
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
                handler=_handler(name),
                description=description,
            )
        except Exception as exc:
            logger.warning("song2html tool %s skipped: %s", name, exc)

    logger.info("song2html Hermes plugin registered")
