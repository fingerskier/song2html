import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import songToHtml from '../index.js'

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
  },
  async ({ source, arrangement }) => {
    const result = songToHtml(source, arrangement || '')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
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

    if (!song.title) issues.push({ type: 'missing-title', message: 'No title found on first line' })

    const valid = issues.length === 0
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
    chords: z.record(z.string(), z.string()).describe('Map of section type to chord progression (e.g. {"verse": "G C D G", "chorus": "C D Em G"})'),
    sections: z.array(z.object({
      name: z.string().describe('Section name (e.g. "Verse 1", "Chorus")'),
      lyrics: z.array(z.string()).describe('Array of lyric lines with ^ caret markers for chord placement'),
      transpose: z.number().optional().describe('Half-step transpose offset for Nashville numbers'),
    })).describe('Ordered lyric sections'),
    arrangements: z.record(z.string(), z.array(z.string())).optional().describe('Named arrangements mapping to arrays of section names'),
  },
  async ({ title, key, author, tempo, time, chords, sections, arrangements }) => {
    const lines = []

    // Title line
    lines.push(key ? `${title} [${key}]` : title)

    // Metadata
    if (author) lines.push(`  author: ${author}`)
    if (tempo != null) lines.push(`  tempo: ${tempo}`)
    if (time) lines.push(`  time: ${time}`)

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
  },
  async ({ path, arrangement }) => {
    const source = await readFile(resolve(path), 'utf-8')
    const result = songToHtml(source, arrangement || '')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source, ...result }, null, 2),
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
  },
  async ({ path, source }) => {
    const { song, errata } = songToHtml(source)
    await writeFile(resolve(path), source, 'utf-8')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ written: resolve(path), song, errata }, null, 2),
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
    const dir = resolve(directory)
    const entries = await readdir(dir)
    const songs = []

    for (const entry of entries) {
      if (extname(entry) !== '.txt') continue
      const fullPath = join(dir, entry)
      const info = await stat(fullPath)
      if (!info.isFile()) continue

      const source = await readFile(fullPath, 'utf-8')
      const { song, errata } = songToHtml(source)
      songs.push({
        file: entry,
        path: fullPath,
        title: song.title,
        key: song.key,
        authors: song.authors,
        tempo: song.tempo,
        time: song.time,
        issues: errata.length,
      })
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
        const chordLine = line.match(/^(\s*[\w -]+:\s*)(.+)$/)
        if (chordLine && !line.match(/^\s*(key|tempo|author|time):/i) && result.length > 0) {
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
    source: z.string().describe('The song2html source text'),
    arrangement: z.string().optional().describe('Optional arrangement name'),
  },
  async ({ source, arrangement }) => {
    const { html, song } = songToHtml(source, arrangement || '')
    const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${song.title || 'Song'}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  .s2h-song { }
  .s2h-page { margin-bottom: 2rem; page-break-after: always; }
  .s2h-meta { margin-bottom: 1.5rem; border-bottom: 1px solid #ccc; padding-bottom: 1rem; }
  .s2h-meta-title { margin: 0 0 0.5rem; font-size: 1.8rem; }
  .s2h-meta p { margin: 0.2rem 0; color: #555; }
  .s2h-chords { background: #f8f8f0; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
  .s2h-chords-title { margin: 0 0 0.5rem; font-size: 1.1rem; }
  .s2h-chord-line { margin: 0.3rem 0; }
  .s2h-chord-section-label { font-weight: bold; margin-right: 0.5rem; color: #333; }
  .s2h-chord-line .s2h-chord { display: inline-block; background: #e8e0d0; padding: 0.1rem 0.4rem; border-radius: 3px; margin: 0 0.15rem; font-weight: bold; font-size: 0.95rem; }
  .s2h-section { margin-bottom: 1.5rem; }
  .s2h-section-title { font-size: 1.1rem; color: #666; margin: 0 0 0.5rem; border-left: 3px solid #999; padding-left: 0.5rem; }
  .s2h-lyric-line { margin: 0.4rem 0; font-size: 1.1rem; position: relative; padding-top: 1.2rem; }
  .s2h-lyric-line .s2h-chord { position: relative; top: -0.1rem; font-weight: bold; color: #b44; font-size: 0.9rem; margin-right: 1px; }
</style>
</head>
<body>
${html}
</body>
</html>`

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
