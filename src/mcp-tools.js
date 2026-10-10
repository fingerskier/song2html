import { readFile, writeFile, rename, readdir, stat, mkdir, realpath, rm, chmod } from 'node:fs/promises'
import { join, extname, resolve, relative, dirname, basename, isAbsolute } from 'node:path'
import { previewPlain, renderStandalone, THEMES } from './render.js'
import { renderSongHtml } from './html.js'
import { createSongAst, formatKey, parseSong, serializeSong, transposeSongAst, validateSong } from './ast.js'
import { detectFormat, importSong } from './importers.js'

export const OUTPUT_FIELDS = ['html', 'arrangements', 'song', 'errata']
export const PARSE_FIELDS = [...OUTPUT_FIELDS, 'ast']
export { THEMES }

function libraryRoot() {
  return process.env.SONG2HTML_LIBRARY_ROOT ? resolve(process.env.SONG2HTML_LIBRARY_ROOT) : null
}

const isInside = (root, target) => {
  const rel = relative(root, target)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'))
}

// Resolves symlinks (of the path, or of its nearest existing ancestor for new files)
// before checking SONG2HTML_LIBRARY_ROOT, so links cannot escape the library.
export async function safePath(path) {
  const resolvedPath = resolve(path)
  const configured = libraryRoot()
  if (!configured) return resolvedPath
  const root = await realpath(configured)
  let existing = resolvedPath
  const missing = []
  for (;;) {
    try {
      existing = await realpath(existing)
      break
    } catch (error) {
      if (error.code !== 'ENOENT' || dirname(existing) === existing) throw error
      missing.unshift(basename(existing))
      existing = dirname(existing)
    }
  }
  const target = join(existing, ...missing)
  if (!isInside(root, target)) throw new Error(`Path is outside configured SONG2HTML_LIBRARY_ROOT: ${configured}`)
  return target
}

// Parses once and renders from the AST; errata combine parse and render diagnostics.
function parseAndRender(source, arrangement, capo) {
  const parsed = parseSong(source)
  const rendered = renderSongHtml(parsed.song, { arrangement: arrangement || '', capo })
  return { html: rendered.html, arrangements: rendered.arrangements, song: rendered.song, errata: [...parsed.diagnostics, ...rendered.diagnostics], ast: parsed.song }
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
  async parse_song({ source, arrangement, capo, include }) {
    const result = parseAndRender(source, arrangement, capo)
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

  async create_song({ title, key, author, tempo, capo, time, owner, license, chords, sections, arrangements }) {
    const ast = createSongAst({ title, key, author, tempo, capo, time, owner, license, chords, sections, arrangements })
    const source = serializeSong(ast)
    const result = renderSongHtml(ast)
    return jsonResult({ source, ast, song: result.song, errata: validateSong(ast) })
  },

  async read_song_file({ path, arrangement, capo, include }) {
    const source = await readFile(await safePath(path), 'utf-8')
    const result = parseAndRender(source, arrangement, capo)
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
    const destination = await safePath(path)
    const hasErrors = errata.some((entry) => entry.severity === 'error')
    if (hasErrors && !allowInvalid) {
      throw new Error('Song has error-severity diagnostics; pass allowInvalid=true to override')
    }
    const exists = await stat(destination).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error })
    if (exists && !overwrite) throw new Error(`File already exists: ${destination}; pass overwrite=true to replace it`)
    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true })
      if (!overwrite) {
        // 'wx' fails if the file appeared since the check, so a concurrent writer is never clobbered.
        await writeFile(destination, source, { encoding: 'utf-8', flag: 'wx' }).catch((error) => {
          if (error.code === 'EEXIST') throw new Error(`File already exists: ${destination}; pass overwrite=true to replace it`)
          throw error
        })
      } else {
        // Atomic replace that keeps the existing file's permissions.
        const mode = await stat(destination).then((info) => info.mode & 0o777, () => null)
        const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
        try {
          await writeFile(temporary, source, { encoding: 'utf-8', flag: 'wx' })
          if (mode != null) await chmod(temporary, mode)
          await rename(temporary, destination)
        } catch (error) {
          await rm(temporary, { force: true })
          throw error
        }
      }
    }
    return jsonResult({ written: dryRun ? null : destination, dryRun, song, errata })
  },

  async list_song_files({ directory, extensions, recursive = false }) {
    const dir = await safePath(directory)
    const songExtensions = new Set((extensions?.length ? extensions : ['.txt', '.s2h', '.song', '.pro', '.chopro', '.chordpro']).map((entry) => (entry.startsWith('.') ? entry : `.${entry}`).toLowerCase()))
    const entries = await readdir(dir, { withFileTypes: true, recursive })
    const songs = []
    const candidates = entries.filter((entry) => entry.isFile() && songExtensions.has(extname(entry.name).toLowerCase()))
    const concurrency = 8
    for (let start = 0; start < candidates.length; start += concurrency) {
      const batch = candidates.slice(start, start + concurrency)
      const parsed = await Promise.all(batch.map(async (entry) => {
        const fullPath = join(entry.parentPath ?? entry.path ?? dir, entry.name)
        try {
          const { song, diagnostics } = parseSong(await readFile(fullPath, 'utf-8'))
          return {
            file: relative(dir, fullPath),
            path: fullPath,
            title: song.metadata.title,
            key: formatKey(song.metadata.key) || null,
            authors: song.metadata.authors,
            tempo: song.metadata.tempo,
            time: song.metadata.timeSignature,
            capo: song.metadata.capo,
            issues: diagnostics.length,
          }
        } catch (error) {
          return { file: relative(dir, fullPath), path: fullPath, error: error.message }
        }
      }))
      songs.push(...parsed)
    }
    return jsonResult({ directory: dir, count: songs.length, songs })
  },

  async transpose_song({ source, steps }) {
    const parsedSource = parseSong(source)
    const ast = transposeSongAst(parsedSource.song, steps)
    const transposed = serializeSong(ast)
    const parsed = renderSongHtml(ast)
    return jsonResult({ source: transposed, ast, song: parsed.song, errata: validateSong(ast) })
  },

  async detect_format({ source }) {
    return jsonResult({ candidates: detectFormat(source) })
  },

  async import_song({ source, format = 'auto', sourceName, title, key, align, tabWidth, includeOriginalMapping = false }) {
    const result = importSong(source, { format, sourceName, title, key, align, tabWidth })
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

  async render_html({ source, arrangement, theme, language, capo }) {
    const { page } = renderStandalone(source, arrangement || '', { theme, language, capo })
    return { content: [{ type: 'text', text: page }] }
  },
}

export const TOOL_NAMES = Object.keys(TOOL_HANDLERS)

export async function runTool(name, args = {}) {
  const handler = TOOL_HANDLERS[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)
  return handler(args)
}
