import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { PARSE_FIELDS, THEMES, runTool } from './mcp-tools.js'

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const server = new McpServer({
  name: 'song2html',
  version: packageMetadata.version,
  description: 'Read, write, parse, validate, and convert song chord charts using the song2html format.',
})

function registerTool(name, description, schema) {
  server.tool(name, description, schema, async (args) => runTool(name, args))
}

registerTool(
  'parse_song',
  'Parse song2html source text and return structured metadata, HTML output, available arrangements, and any parsing errata.',
  {
    source: z.string().describe('The raw song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name to render'),
    include: z.array(z.enum(PARSE_FIELDS)).optional().describe('Result fields to include; defaults to compatibility fields'),
  },
)

registerTool(
  'validate_song',
  'Validate song2html source text and return any errors or warnings without generating full HTML.',
  {
    source: z.string().describe('The raw song2html source text'),
  },
)

registerTool(
  'create_song',
  'Generate song2html source text from structured input (title, key, metadata, chord definitions, lyric sections, and arrangements).',
  {
    title: z.string().describe('Song title'),
    key: z.string().optional().describe('Musical key (e.g. "G", "F#", "Bbm")'),
    author: z.string().optional().describe('Comma-separated author names'),
    tempo: z.number().optional().describe('BPM'),
    time: z.string().optional().describe('Time signature (e.g. "4/4", "3/4")'),
    owner: z.string().optional().describe('Copyright owner'),
    license: z.string().optional().describe('License identifier or name'),
    chords: z.record(z.string(), z.string()).describe('Map of section type to chord progression (e.g. {"verse": "G C D G", "chorus": "C D Em G"})'),
    sections: z.array(z.object({
      name: z.string().describe('Section name (e.g. "Verse 1", "Chorus")'),
      lyrics: z.array(z.string()).describe('Array of lyric lines with ^ caret markers for chord placement'),
      transpose: z.number().optional().describe('Half-step transpose offset for Nashville numbers'),
    })).describe('Ordered lyric sections'),
    arrangements: z.record(z.string(), z.array(z.string())).optional().describe('Named arrangements mapping to arrays of section names'),
  },
)

registerTool(
  'read_song_file',
  'Read a song file from disk, parse it, and return the source text along with structured metadata and HTML.',
  {
    path: z.string().describe('Absolute path to the song file'),
    arrangement: z.string().optional().describe('Optional arrangement name'),
    include: z.array(z.enum(['source', ...PARSE_FIELDS])).optional().describe('Result fields to include; defaults to compatibility fields'),
  },
)

registerTool(
  'write_song_file',
  'Write song2html source text to a file on disk. Validates the content before writing and returns any errata.',
  {
    path: z.string().describe('Absolute path to write the song file'),
    source: z.string().describe('The song2html source text to write'),
    allowInvalid: z.boolean().default(false).describe('Write despite error-severity diagnostics'),
    overwrite: z.boolean().default(false).describe('Replace an existing file'),
    dryRun: z.boolean().default(false).describe('Validate without writing'),
  },
)

registerTool(
  'list_song_files',
  'List song files (*.txt, *.s2h, *.pro, *.chopro, *.chordpro) in a directory and return basic metadata (title, key, authors) for each.',
  {
    directory: z.string().describe('Absolute path to the directory to scan'),
  },
)

registerTool(
  'transpose_song',
  'Transpose a song\'s named chords by a given number of half steps. Returns the modified source text with transposed chords. Nashville numbers are unaffected (they transpose automatically via the key).',
  {
    source: z.string().describe('The song2html source text'),
    steps: z.number().describe('Number of half steps to transpose (positive = up, negative = down)'),
  },
)

registerTool(
  'detect_format',
  'Detect supported song-chart formats and return ranked confidence with evidence.',
  { source: z.string().describe('Source chart text to inspect') },
)

registerTool(
  'import_song',
  'Deterministically import ChordPro, inline bracket chords, OpenSong XML, chords-over-lyrics, or song2html into the canonical Song AST.',
  {
    source: z.string().describe('Source chart text'),
    format: z.enum(['auto', 'chordpro', 'inline-brackets', 'opensong', 'chords-over-lyrics', 'song2html']).default('auto'),
    sourceName: z.string().optional().describe('Original filename or provenance label'),
    title: z.string().optional().describe('Title override for formats without metadata'),
    key: z.string().optional().describe('Key override for formats without metadata'),
    align: z.enum(['word', 'column']).optional().describe('Chords-over-lyrics caret alignment; default word'),
    includeOriginalMapping: z.boolean().default(false).describe('Include source-line to imported-event mapping'),
  },
)

registerTool(
  'preview_song',
  'Render song2html source as compact plain text with inline [Chord] markers. Use this to verify caret placement without generating a full HTML page.',
  {
    source: z.string().describe('The raw song2html source text'),
  },
)

registerTool(
  'render_html',
  'Render song2html source text to a complete standalone HTML page with embedded styles for previewing in a browser.',
  {
    source: z.string().describe('The raw song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name'),
    theme: z.enum(THEMES).optional().describe('Built-in rendering theme'),
    language: z.string().optional().describe('BCP 47 document language (defaults to en)'),
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
