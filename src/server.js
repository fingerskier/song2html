import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, rename, readdir, stat, mkdir } from 'node:fs/promises'
import { join, extname, resolve, relative, dirname } from 'node:path'
import songToHtml from '../index.js'
import { renderStandalone, THEMES } from './render.js'
import { createSongAst, formatKey, parseSong, serializeSong, transposeSongAst, validateSong } from './ast.js'
import { detectFormat, importSong } from './importers.js'

const LIBRARY_ROOT = process.env.SONG2HTML_LIBRARY_ROOT ? resolve(process.env.SONG2HTML_LIBRARY_ROOT) : null
const OUTPUT_FIELDS = ['html', 'arrangements', 'song', 'errata']
const PARSE_FIELDS = [...OUTPUT_FIELDS, 'ast']
const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function safePath(path) {
  const resolvedPath = resolve(path)
  if (LIBRARY_ROOT) {
    const rel = relative(LIBRARY_ROOT, resolvedPath)
    if (rel.startsWith('..') || rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error(`Path is outside configured SONG2HTML_LIBRARY_ROOT: ${LIBRARY_ROOT}`)
    }
  }
  return resolvedPath
}

function selectResult(result, include, extras = {}) {
  const fields = include === undefined ? OUTPUT_FIELDS : include
  return Object.fromEntries([
    ...Object.entries(extras),
    ...fields.filter((field) => Object.hasOwn(result, field)).map((field) => [field, result[field]]),
  ])
}

const server = new McpServer({
  name: 'song2html',
  version: packageMetadata.version,
  description: 'Read, write, parse, validate, and convert song chord charts using the song2html format.',
})

// ── parse_song ──────────────────────────────────────────────────────────────
server.tool(
  'parse_song',
  'Parse song2html source text and return structured metadata, HTML output, available arrangements, and any parsing errata.',
  {
    source: z.string().describe('The raw song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name to render'),
    include: z.array(z.enum(PARSE_FIELDS)).optional().describe('Result fields to include; defaults to compatibility fields'),
  },
  async ({ source, arrangement, include }) => {
    const result = songToHtml(source, arrangement || '')
    result.ast = parseSong(source).song
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(selectResult(result, include), null, 2),
      }],
    }
  },
)

// ── validate_song ───────────────────────────────────────────────────────────
server.tool(
  'validate_song',
  'Validate song2html source text and return any errors or warnings without generating full HTML.',
  {
    source: z.string().describe('The raw song2html source text'),
  },
  async ({ source }) => {
    const parsed = parseSong(source)
    const issues = parsed.diagnostics
    const valid = !issues.some((entry) => entry.severity === 'error')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ valid, song: parsed.song, arrangements: parsed.song.arrangements.map((entry) => entry.name), issues }, null, 2),
      }],
    }
  },
)

// ── create_song ─────────────────────────────────────────────────────────────
server.tool(
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
  async ({ title, key, author, tempo, time, owner, license, chords, sections, arrangements }) => {
    const ast = createSongAst({ title, key, author, tempo, time, owner, license, chords, sections, arrangements })
    const source = serializeSong(ast)
    const result = songToHtml(source)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source, ast, song: result.song, errata: validateSong(ast) }, null, 2),
      }],
    }
  },
)

// ── read_song_file ──────────────────────────────────────────────────────────
server.tool(
  'read_song_file',
  'Read a song file from disk, parse it, and return the source text along with structured metadata and HTML.',
  {
    path: z.string().describe('Absolute path to the song file'),
    arrangement: z.string().optional().describe('Optional arrangement name'),
    include: z.array(z.enum(['source', ...PARSE_FIELDS])).optional().describe('Result fields to include; defaults to compatibility fields'),
  },
  async ({ path, arrangement, include }) => {
    const source = await readFile(safePath(path), 'utf-8')
    const result = songToHtml(source, arrangement || '')
    result.ast = parseSong(source).song
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(selectResult(result, include?.filter((field) => field !== 'source'), include?.includes('source') || !include ? { source } : {}), null, 2),
      }],
    }
  },
)

// ── write_song_file ─────────────────────────────────────────────────────────
server.tool(
  'write_song_file',
  'Write song2html source text to a file on disk. Validates the content before writing and returns any errata.',
  {
    path: z.string().describe('Absolute path to write the song file'),
    source: z.string().describe('The song2html source text to write'),
    allowInvalid: z.boolean().default(false).describe('Write despite error-severity diagnostics'),
    overwrite: z.boolean().default(false).describe('Replace an existing file'),
    dryRun: z.boolean().default(false).describe('Validate without writing'),
  },
  async ({ path, source, allowInvalid, overwrite, dryRun }) => {
    const parsed = parseSong(source)
    const song = parsed.song
    const errata = parsed.diagnostics
    const destination = safePath(path)
    const hasErrors = errata.some((entry) => entry.severity === 'error')
    if (hasErrors && !allowInvalid) throw new Error('Song has error-severity diagnostics; pass allowInvalid=true to override')
    if (!overwrite) {
      try {
        await stat(destination)
        throw new Error(`File already exists: ${destination}; pass overwrite=true to replace it`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true })
      const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
      await writeFile(temporary, source, { encoding: 'utf-8', mode: 0o600 })
      await rename(temporary, destination)
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ written: dryRun ? null : destination, dryRun, song, errata }, null, 2),
      }],
    }
  },
)

// ── list_song_files ─────────────────────────────────────────────────────────
server.tool(
  'list_song_files',
  'List song files (*.txt) in a directory and return basic metadata (title, key, authors) for each.',
  {
    directory: z.string().describe('Absolute path to the directory to scan'),
  },
  async ({ directory }) => {
    const dir = safePath(directory)
    const entries = await readdir(dir)
    const songs = []

    const candidates = entries.filter((entry) => extname(entry).toLowerCase() === '.txt')
    const concurrency = 8
    for (let start = 0; start < candidates.length; start += concurrency) {
      const batch = candidates.slice(start, start + concurrency)
      const parsed = await Promise.all(batch.map(async (entry) => {
      const fullPath = join(dir, entry)
      const info = await stat(fullPath)
      if (!info.isFile()) return null

      const source = await readFile(fullPath, 'utf-8')
      const { song, diagnostics } = parseSong(source)
      return {
        file: entry,
        path: fullPath,
        title: song.metadata.title,
        key: formatKey(song.metadata.key) || null,
        authors: song.metadata.authors,
        tempo: song.metadata.tempo,
        time: song.metadata.timeSignature,
        issues: diagnostics.length,
      }
      }))
      songs.push(...parsed.filter(Boolean))
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ directory: dir, count: songs.length, songs }, null, 2),
      }],
    }
  },
)

// ── transpose_song ──────────────────────────────────────────────────────────
server.tool(
  'transpose_song',
  'Transpose a song\'s named chords by a given number of half steps. Returns the modified source text with transposed chords. Nashville numbers are unaffected (they transpose automatically via the key).',
  {
    source: z.string().describe('The song2html source text'),
    steps: z.number().describe('Number of half steps to transpose (positive = up, negative = down)'),
  },
  async ({ source, steps }) => {
    const parsedSource = parseSong(source)
    const ast = transposeSongAst(parsedSource.song, steps)
    const transposed = serializeSong(ast)
    const parsed = songToHtml(transposed)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: transposed, ast, song: parsed.song, errata: validateSong(ast) }, null, 2),
      }],
    }
  },
)

// ── detect_format / import_song ─────────────────────────────────────────────
server.tool(
  'detect_format',
  'Detect supported song-chart formats and return ranked confidence with evidence.',
  { source: z.string().describe('Source chart text to inspect') },
  async ({ source }) => ({
    content: [{ type: 'text', text: JSON.stringify({ candidates: detectFormat(source) }, null, 2) }],
  }),
)

server.tool(
  'import_song',
  'Deterministically import ChordPro, inline bracket chords, OpenSong XML, chords-over-lyrics, or song2html into the canonical Song AST.',
  {
    source: z.string().describe('Source chart text'),
    format: z.enum(['auto', 'chordpro', 'inline-brackets', 'opensong', 'chords-over-lyrics', 'song2html']).default('auto'),
    sourceName: z.string().optional().describe('Original filename or provenance label'),
    title: z.string().optional().describe('Title override for formats without metadata'),
    key: z.string().optional().describe('Key override for formats without metadata'),
    includeOriginalMapping: z.boolean().default(false).describe('Include source-line to imported-event mapping'),
  },
  async ({ source, format, sourceName, title, key, includeOriginalMapping }) => {
    const result = importSong(source, { format, sourceName, title, key })
    if (!includeOriginalMapping) delete result.mapping
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// ── render_html ─────────────────────────────────────────────────────────────
server.tool(
  'render_html',
  'Render song2html source text to a complete standalone HTML page with embedded styles for previewing in a browser.',
  {
    source: z.string().describe('The raw song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name'),
    theme: z.enum(THEMES).optional().describe('Built-in rendering theme'),
    language: z.string().optional().describe('BCP 47 document language (defaults to en)'),
  },
  async ({ source, arrangement, theme, language }) => {
    const { page } = renderStandalone(source, arrangement || '', { theme, language })

    return {
      content: [{
        type: 'text',
        text: page,
      }],
    }
  },
)

// ── Start server ────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
