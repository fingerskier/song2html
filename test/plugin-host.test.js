import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'

const readJson = (relative) => readFile(new URL(relative, import.meta.url), 'utf8').then(JSON.parse)
const readText = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

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

test('Hermes native plugin matches package version and ships register entry', async () => {
  const pkg = await readJson('../package.json')
  const grok = await readJson('../plugin.json')
  const yaml = await readText('../plugin.yaml')
  const init = await readText('../__init__.py')
  const after = await readText('../after-install.md')
  const escapedVersion = pkg.version.replaceAll('.', '\\.')

  assert.equal(pkg.version, grok.version)
  assert.match(yaml, /^name: song2html$/m)
  assert.match(yaml, new RegExp(`^version: ${escapedVersion}$`, 'm'))
  assert.match(yaml, /^provides_commands:$/m)
  assert.match(yaml, /^  - convert-chord-chart$/m)
  assert.match(init, /def register\(ctx\)/)
  assert.match(init, /def invoke_tool\(/)
  assert.match(after, /npm install/)

  await access(new URL('../bin/song2html-tool.js', import.meta.url), constants.R_OK)
  await access(new URL('../skills/song2html/SKILL.md', import.meta.url), constants.R_OK)
  await access(new URL('../skills/convert-chord-chart/SKILL.md', import.meta.url), constants.R_OK)
})
