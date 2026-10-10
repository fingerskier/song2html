import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { readFile } from 'node:fs/promises'
import { TOOLS, runTool } from './mcp-tools.js'

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const server = new Server(
  { name: 'song2html', version: packageMetadata.version },
  {
    capabilities: { tools: {} },
    instructions: 'Chord charts in the song2html text format. Write the text directly (see the song2html skill), then call validate_song and preview_song; use import_song for other formats and render_html for HTML.',
  },
)

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({ ...tool, annotations: READ_ONLY })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await runTool(request.params.name, request.params.arguments ?? {})
  } catch (error) {
    return { content: [{ type: 'text', text: error.message }], isError: true }
  }
})

await server.connect(new StdioServerTransport())
