# After installing song2html

This plugin runs the Node song2html library. Install dependencies in the plugin
directory before enabling it:

```bash
cd "$HERMES_HOME/plugins/song2html"
npm install --omit=dev
```

Node.js 20 or newer must be on `PATH`.

Then:

```bash
hermes plugins enable song2html
```

Restart the gateway from an external shell (`hermes gateway restart`). Do not
restart a gateway from inside its own agent session.

In a session:

- `/convert-chord-chart` follows the conversion skill
- Load skills with `skill_view` using `song2html` or `convert-chord-chart`
- Tools: `import_song`, `validate_song`, `preview_song`, `render_html`
  (text in, text out; they never touch files)

Call `import_song` then `preview_song` before rewriting a chart by hand.

The Claude Code / Grok plugin at the repository root is unchanged. Hermes uses
`plugin.yaml` plus `__init__.py`.
