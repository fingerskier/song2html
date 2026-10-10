from __future__ import annotations

import importlib.util
import json
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
    def __init__(self):
        self.skills = []
        self.commands = []
        self.tools = []

    def get_config(self, key, default=None):
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

    def test_register_wires_skills_command_and_shared_tool_definitions(self):
        ctx = FakeCtx()
        self.plugin.register(ctx)
        self.assertEqual([name for name, *_ in ctx.skills], ["song2html", "convert-chord-chart"])
        self.assertTrue(all(path.is_file() for _, path, _ in ctx.skills))
        self.assertEqual(ctx.commands[0][0], "convert-chord-chart")
        definitions = json.loads((REPO / "tools.json").read_text(encoding="utf-8"))
        self.assertEqual([name for name, *_ in ctx.tools], [tool["name"] for tool in definitions])
        self.assertEqual([schema["parameters"] for _, _, schema, *_ in ctx.tools], [tool["inputSchema"] for tool in definitions])
        self.assertTrue(all(toolset == "song2html" for _, toolset, *_ in ctx.tools))
        self.assertIn("import_song", ctx.commands[0][1]("Amazing Grace"))

    def test_invoke_validate_song(self):
        payload = self.plugin.invoke_tool(
            "validate_song",
            {"source": "Invoke [C]\n  verse: C G\n\nSections:\n  Verse:\n    ^hi ^there"},
        )
        body = json.loads(payload)
        self.assertTrue(body["valid"])
        self.assertEqual(body["song"]["key"], "C")
        self.assertEqual(body["diagnostics"], [])

    def test_invalid_arguments_return_an_error(self):
        body = json.loads(self.plugin.invoke_tool("import_song", {"source": "x", "transpose": 1.5}))
        self.assertIn("must be an integer", body["error"])


if __name__ == "__main__":
    unittest.main()
