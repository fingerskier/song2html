import { readFile, writeFile, rename, readdir, stat, mkdir } from 'node:fs/promises'
import { join, extname, resolve, relative, dirname } from 'node:path'
import songToHtml from '../index.js'
import { previewPlain, renderStandalone, THEMES } from './render.js'
import { createSongAst, formatKey, parseSong, serializeSong, transposeSongAst, validateSong } from './ast.js'
import { detectFormat, importSong } from './importers.js'

export const OUTPUT_FIELDS = ['html', 'arrangements', 'song', 'errata']
export const PARSE_FIELDS = [...OUTPUT_FIELDS, 'ast']
export { THEMES }

function libraryRoot() {
  return process.env.SONG2HTML_LIBRARY_ROOT ? resolve(process.env.SONG2HTML_LIBRARY_ROOT) : null
}

export function safePath(path) {
  const resolvedPath = resolve(path)
  const root = libraryRoot()
  if (root) {
    const rel = relative(root, resolvedPath)
    if (rel.startsWith('..') || rel.includes(`..${process.platform === 'win32' ? '\\\\' : '/'}`)) {
      throw new Error(`Path is outside configured SONG2HTML_LIBRARY_ROOT: ${root}`)
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

function jsonResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

export const TOOL_HANDLERS = {
  async parse_song({ source, arrangement, include }) {
    const result = songToHtml(source, arrangement || '')
    result.ast = parseSong(source).song
    return jsonResult(selectResult(result, include))
  },

  async validate_song({ source }) {
    const parsed = parseSong(source)
    const issues = parsed.diagnostics
    const valid = !issues.some((entry) => entry.severity === 'error')
    return jsonResult({
      valid,
      song: parsed.song,
      arrangements: parsed.song.arrangements.map((entry) => entry.name),
      issues,
    })
  },

  async create_song({ title, key, author, tempo, time, owner, license, chords, sections, arrangements }) {
    const ast = createSongAst({ title, key, author, tempo, time, owner, license, chords, sections, arrangements })
    const source = serializeSong(ast)
    const result = songToHtml(source)
    return jsonResult({ source, ast, song: result.song, errata: validateSong(ast) })
  },

  async read_song_file({ path, arrangement, include }) {
    const source = await readFile(safePath(path), 'utf-8')
    const result = songToHtml(source, arrangement || '')
    result.ast = parseSong(source).song
    return jsonResult(selectResult(
      result,
      include?.filter((field) => field !== 'source'),
      include?.includes('source') || !include ? { source } : {},
    ))
  },

  async write_song_file({ path, source, allowInvalid = false, overwrite = false, dryRun = false }) {
    const parsed = parseSong(source)
    const song = parsed.song
    const errata = parsed.diagnostics
    const destination = safePath(path)
    const hasErrors = errata.some((entry) => entry.severity === 'error')
    if (hasErrors && !allowInvalid) {
      throw new Error('Song has error-severity diagnostics; pass allowInvalid=true to override')
    }
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
    return jsonResult({ written: dryRun ? null : destination, dryRun, song, errata })
  },

  async list_song_files({ directory }) {
    const dir = safePath(directory)
    const entries = await readdir(dir)
    const songs = []
    const songExtensions = new Set(['.txt', '.s2h', '.pro', '.chopro', '.chordpro'])
    const candidates = entries.filter((entry) => songExtensions.has(extname(entry).toLowerCase()))
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
    return jsonResult({ directory: dir, count: songs.length, songs })
  },

  async transpose_song({ source, steps }) {
    const parsedSource = parseSong(source)
    const ast = transposeSongAst(parsedSource.song, steps)
    const transposed = serializeSong(ast)
    const parsed = songToHtml(transposed)
    return jsonResult({ source: transposed, ast, song: parsed.song, errata: validateSong(ast) })
  },

  async detect_format({ source }) {
    return jsonResult({ candidates: detectFormat(source) })
  },

  async import_song({ source, format = 'auto', sourceName, title, key, align, includeOriginalMapping = false }) {
    const result = importSong(source, { format, sourceName, title, key, align })
    if (!includeOriginalMapping) delete result.mapping
    return jsonResult(result)
  },

  async preview_song({ source }) {
    const preview = previewPlain(source)
    return jsonResult({
      text: preview.text,
      song: {
        title: preview.song.metadata.title,
        key: formatKey(preview.song.metadata.key) || null,
        authors: preview.song.metadata.authors,
      },
      diagnostics: preview.diagnostics,
    })
  },

  async render_html({ source, arrangement, theme, language }) {
    const { page } = renderStandalone(source, arrangement || '', { theme, language })
    return { content: [{ type: 'text', text: page }] }
  },
}

export const TOOL_NAMES = Object.keys(TOOL_HANDLERS)

export async function runTool(name, args = {}) {
  const handler = TOOL_HANDLERS[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)
  return handler(args)
}
