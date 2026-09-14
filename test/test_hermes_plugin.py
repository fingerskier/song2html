from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def load_plugin():
    spec = importlib.util.spec_from_file_location("song2html_hermes_plugin", REPO / "__init__.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load Hermes plugin module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeCtx:
    def __init__(self, library_root=None):
        self.library_root = library_root
        self.skills = []
        self.commands = []
        self.tools = []

    def get_config(self, key, default=None):
        if key == "library_root":
            return self.library_root
        return default

    def register_skill(self, name, path, description=""):
        self.skills.append((name, Path(path), description))

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands.append((name, handler, description, args_hint))

    def register_tool(self, name, toolset, schema, handler, description=""):
        self.tools.append((name, toolset, schema, handler, description))


class HermesPluginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plugin = load_plugin()

    def test_register_wires_skills_command_and_mcp_tool_names(self):
        ctx = FakeCtx()
        self.plugin.register(ctx)
        self.assertEqual([name for name, *_ in ctx.skills], ["song2html", "convert-chord-chart"])
        self.assertTrue(all(path.is_file() for _, path, _ in ctx.skills))
        self.assertEqual(ctx.commands[0][0], "convert-chord-chart")
        self.assertEqual([name for name, *_ in ctx.tools], [name for name, *_ in self.plugin.TOOLS])
        self.assertTrue(all(toolset == "song2html" for _, toolset, *_ in ctx.tools))
        self.assertIn("detect_format", ctx.commands[0][1]("Amazing Grace"))

    def test_invoke_parse_song(self):
        payload = self.plugin.invoke_tool(
            "parse_song",
            {
                "source": "Invoke [C]\n  verse: C G\n\nSections:\n  Verse:\n    ^hi ^there",
                "include": ["song", "errata"],
            },
        )
        body = json.loads(payload)
        self.assertEqual(body["song"]["key"], "C")
        self.assertNotIn("html", body)
        self.assertEqual(body["errata"], [])

    def test_library_root_blocks_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = os.environ.pop("SONG2HTML_LIBRARY_ROOT", None)
            try:
                payload = self.plugin.invoke_tool(
                    "list_song_files",
                    {"directory": str(REPO)},
                    library_root=tmp,
                )
            finally:
                if previous is not None:
                    os.environ["SONG2HTML_LIBRARY_ROOT"] = previous
        body = json.loads(payload)
        self.assertIn("error", body)
        self.assertIn("SONG2HTML_LIBRARY_ROOT", body["error"])


if __name__ == "__main__":
    unittest.main()
