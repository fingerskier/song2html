import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, rename, readdir, stat, mkdir } from 'node:fs/promises'
import { join, extname, resolve, relative, dirname } from 'node:path'
import songToHtml from '../index.js'
import { renderStandalone, THEMES } from './render.js'

const LIBRARY_ROOT = process.env.SONG2HTML_LIBRARY_ROOT ? resolve(process.env.SONG2HTML_LIBRARY_ROOT) : null
const OUTPUT_FIELDS = ['html', 'arrangements', 'song', 'errata']

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
  version: '1.0.0',
  description: 'Read, write, parse, validate, and convert song chord charts using the song2html format.',
})

// ── parse_song ──────────────────────────────────────────────────────────────
server.tool(
  'parse_song',
  'Parse song2html source text and return structured metadata, HTML output, available arrangements, and any parsing errata.',
  {
    source: z.string().describe('The raw song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name to render'),
    include: z.array(z.enum(OUTPUT_FIELDS)).optional().describe('Result fields to include; defaults to all'),
  },
  async ({ source, arrangement, include }) => {
    const result = songToHtml(source, arrangement || '')
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
    const { song, arrangements, errata } = songToHtml(source)
    const issues = [...errata]

    if (!song.title) issues.push({ severity: 'error', type: 'missing-title', message: 'No title found on first line' })

    const valid = !issues.some((entry) => entry.severity === 'error')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ valid, song, arrangements, issues }, null, 2),
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
    const lines = []

    // Title line
    lines.push(key ? `${title} [${key}]` : title)

    // Metadata
    if (author) lines.push(`  author: ${author}`)
    if (tempo != null) lines.push(`  tempo: ${tempo}`)
    if (time) lines.push(`  time: ${time}`)
    if (owner) lines.push(`  owner: ${owner}`)
    if (license) lines.push(`  license: ${license}`)

    // Blank line before chords
    lines.push('')

    // Chord definitions
    for (const [section, prog] of Object.entries(chords)) {
      lines.push(`  ${section}: ${prog}`)
    }

    // Sections
    lines.push('')
    lines.push('Sections:')
    for (const sec of sections) {
      lines.push(`  ${sec.name}:`)
      if (sec.transpose) lines.push(`    <transpose ${sec.transpose > 0 ? '+' : ''}${sec.transpose}>`)
      for (const lyric of sec.lyrics) {
        lines.push(`    ${lyric}`)
      }
      lines.push('')
    }

    // Arrangements
    if (arrangements && Object.keys(arrangements).length) {
      lines.push('Arrangements:')
      for (const [name, secs] of Object.entries(arrangements)) {
        lines.push(`  ${name}:`)
        for (const s of secs) {
          lines.push(`    ${s}`)
        }
        lines.push('')
      }
    }

    const source = lines.join('\n')

    // Validate what we generated
    const result = songToHtml(source)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source, song: result.song, errata: result.errata }, null, 2),
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
    include: z.array(z.enum(['source', ...OUTPUT_FIELDS])).optional().describe('Result fields to include; defaults to all'),
  },
  async ({ path, arrangement, include }) => {
    const source = await readFile(safePath(path), 'utf-8')
    const result = songToHtml(source, arrangement || '')
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
    const { song, errata } = songToHtml(source)
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
      const { song, errata } = songToHtml(source)
      return {
        file: entry,
        path: fullPath,
        title: song.title,
        key: song.key,
        authors: song.authors,
        tempo: song.tempo,
        time: song.time,
        issues: errata.length,
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
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']

function semiIndex(note) {
  const up = note.toUpperCase()
  let idx = CHROMATIC.indexOf(up)
  if (idx > -1) return idx
  const alt = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' }[up]
  return alt ? CHROMATIC.indexOf(alt) : -1
}

function transposeNote(note, steps, useFlats) {
  const idx = semiIndex(note)
  if (idx < 0) return note
  const shifted = (idx + steps % 12 + 12) % 12
  let result = CHROMATIC[shifted]
  if (useFlats) result = FLATS[result] || result
  return result
}

function transposeChordToken(token, steps, useFlats) {
  // Match root note possibly with modifier and rest of chord
  const m = token.match(/^([A-Ga-g][#b]?)(.*?)$/)
  if (!m) return token
  const root = m[1][0].toUpperCase() + m[1].slice(1)
  const rest = m[2]

  // Handle slash chords recursively for bass note
  const slashIdx = rest.indexOf('/')
  if (slashIdx > -1) {
    const quality = rest.slice(0, slashIdx)
    const bass = rest.slice(slashIdx + 1)
    const transposedBass = transposeChordToken(bass, steps, useFlats)
    return transposeNote(root, steps, useFlats) + quality + '/' + transposedBass
  }

  return transposeNote(root, steps, useFlats) + rest
}

function transposeLine(line, steps, useFlats) {
  // Transpose chord tokens in a chord definition line
  return line.replace(/\b([A-G][#b]?(?:m|dim|aug|sus|maj|add|min)?[0-9]*(?:\/[A-G][#b]?)?)\b/g, (match) => {
    return transposeChordToken(match, steps, useFlats)
  })
}

server.tool(
  'transpose_song',
  'Transpose a song\'s named chords by a given number of half steps. Returns the modified source text with transposed chords. Nashville numbers are unaffected (they transpose automatically via the key).',
  {
    source: z.string().describe('The song2html source text'),
    steps: z.number().describe('Number of half steps to transpose (positive = up, negative = down)'),
  },
  async ({ source, steps }) => {
    const lines = source.replace(/\r\n?/g, '\n').split('\n')
    const result = []
    let inSections = false
    let inArrangements = false

    for (const line of lines) {
      // Update key in title line
      const keyMatch = line.match(/^(.+)\[([A-Ga-g][#♯b♭]?m?)]$/)
      if (keyMatch && result.length === 0) {
        const rawKey = keyMatch[2].replace(/♯/g, '#').replace(/♭/g, 'b')
        const isMinor = rawKey.endsWith('m')
        const base = isMinor ? rawKey.slice(0, -1) : rawKey
        const useFlats = /b$/.test(base) || FLAT_KEYS.includes(base)
        const newKey = transposeNote(base, steps, useFlats) + (isMinor ? 'm' : '')
        result.push(`${keyMatch[1]}[${newKey}]`)
        continue
      }

      // Update key: metadata
      const keyMeta = line.match(/^(\s*key:\s*)([A-Ga-g][#♯b♭]?m?)(.*)$/i)
      if (keyMeta) {
        const rawKey = keyMeta[2].replace(/♯/g, '#').replace(/♭/g, 'b')
        const isMinor = rawKey.endsWith('m')
        const base = isMinor ? rawKey.slice(0, -1) : rawKey
        const useFlats = /b$/.test(base) || FLAT_KEYS.includes(base)
        const newKey = transposeNote(base, steps, useFlats) + (isMinor ? 'm' : '')
        result.push(`${keyMeta[1]}${newKey}${keyMeta[3]}`)
        continue
      }

      if (/^\s*Sections:/i.test(line)) inSections = true
      if (/^\s*Arrangements:/i.test(line)) { inSections = false; inArrangements = true }

      // Transpose chord definition lines (before Sections:)
      if (!inSections && !inArrangements) {
        const chordLine = line.match(/^(\s*[^:\r\n]+:\s*)(.+)$/u)
        if (chordLine && !line.match(/^\s*(key|tempo|author|time|owner|license):/i) && result.length > 0) {
          const useFlats = /b/i.test(source.match(/\[([A-Ga-g][#♯b♭]?m?)]/)?.[ 1] || '')
          result.push(chordLine[1] + transposeLine(chordLine[2], steps, useFlats))
          continue
        }
      }

      result.push(line)
    }

    const transposed = result.join('\n')
    const parsed = songToHtml(transposed)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: transposed, song: parsed.song, errata: parsed.errata }, null, 2),
      }],
    }
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
