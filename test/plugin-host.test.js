import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readJson = (relative) => readFile(new URL(relative, import.meta.url), 'utf8').then(JSON.parse)

test('Claude and Grok manifests share the song2html name and plugin-rooted MCP', async () => {
  const grok = await readJson('../plugin.json')
  const claude = await readJson('../.claude-plugin/plugin.json')
  const mcp = await readJson('../.mcp.json')
  const legacy = await readJson('../mcp-servers.json')

  assert.equal(grok.name, 'song2html')
  assert.equal(claude.name, 'song2html')
  assert.equal(grok.version, claude.version)
  assert.equal(claude.mcpServers, './.mcp.json')
  assert.deepEqual(mcp, legacy)

  const server = mcp.mcpServers.song2html
  assert.equal(server.command, 'node')
  assert.equal(server.args[0], '${CLAUDE_PLUGIN_ROOT}/bin/song2html-mcp.js')
  assert.doesNotMatch(server.args[0], /^bin\//)
})
