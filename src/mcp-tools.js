// Tool handlers shared by the MCP server (src/server.js), the song2html-tool runner,
// and the Hermes plugin. Names, descriptions, and input schemas live in tools.json so
// every host registers the same definitions.
import { readFileSync } from 'node:fs'
import { formatKey, parseSong, serializeSong, transposeSongAst } from './ast.js'
import { renderSongHtml } from './html.js'
import { importSong } from './importers.js'
import { previewPlain, wrapPage } from './render.js'

export const TOOLS = JSON.parse(readFileSync(new URL('../tools.json', import.meta.url), 'utf8'))
export const TOOL_NAMES = TOOLS.map((tool) => tool.name)

const jsonResult = (payload) => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] })
const songSummary = (song) => ({
  title: song.metadata.title, key: formatKey(song.metadata.key) || null, authors: song.metadata.authors,
  tempo: song.metadata.tempo, time: song.metadata.timeSignature, capo: song.metadata.capo,
})

/** Validates arguments against the subset of JSON Schema used in tools.json and applies defaults. */
export function validateArguments(schema, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('arguments must be an object')
  const result = {}
  for (const name of schema.required || []) if (args[name] === undefined) throw new TypeError(`missing required argument "${name}"`)
  for (const name of Object.keys(args)) if (!schema.properties[name]) throw new TypeError(`unknown argument "${name}"`)
  for (const [name, property] of Object.entries(schema.properties)) {
    const value = args[name] ?? property.default
    if (value === undefined) continue
    const check = (item, spec, label) => {
      const ok = spec.type === 'integer' ? Number.isInteger(item) : spec.type === 'array' ? Array.isArray(item) : typeof item === spec.type
      if (!ok) throw new TypeError(`argument "${label}" must be ${spec.type === 'integer' ? 'an integer' : `a ${spec.type}`}`)
      if (spec.enum && !spec.enum.includes(item)) throw new TypeError(`argument "${label}" must be one of: ${spec.enum.join(', ')}`)
      if (spec.minimum !== undefined && item < spec.minimum) throw new RangeError(`argument "${label}" must be at least ${spec.minimum}`)
      if (spec.maximum !== undefined && item > spec.maximum) throw new RangeError(`argument "${label}" must be at most ${spec.maximum}`)
      if (spec.type === 'array') item.forEach((entry) => check(entry, spec.items, label))
    }
    check(value, property, name)
    result[name] = value
  }
  return result
}

export const TOOL_HANDLERS = {
  async import_song({ source, format, transpose, title, key, align, tabWidth, include = [] }) {
    const imported = importSong(source, { format, title, key, align, tabWidth })
    let { song } = imported
    if (song && transpose) song = transposeSongAst(song, transpose)
    return jsonResult({
      detectedFormat: imported.detectedFormat,
      confidence: imported.confidence,
      song2htmlSource: song ? serializeSong(song) : null,
      diagnostics: imported.diagnostics,
      ...(!song || include.includes('candidates') ? { candidates: imported.candidates } : {}),
      ...(include.includes('ast') ? { ast: song } : {}),
      ...(include.includes('mapping') ? { mapping: imported.mapping ?? [] } : {}),
    })
  },

  async validate_song({ source }) {
    const { song, diagnostics } = parseSong(source)
    return jsonResult({
      valid: !diagnostics.some((entry) => entry.severity === 'error'),
      song: songSummary(song),
      arrangements: song.arrangements.map((entry) => entry.name),
      diagnostics,
    })
  },

  async preview_song({ source }) {
    const preview = previewPlain(source)
    return jsonResult({ text: preview.text, song: songSummary(preview.song), diagnostics: preview.diagnostics })
  },

  async render_html({ source, arrangement, theme, language, capo, fragment }) {
    const parsed = parseSong(source)
    const rendered = renderSongHtml(parsed.song, { arrangement: arrangement || '', capo })
    const errors = [...parsed.diagnostics, ...rendered.diagnostics].filter((entry) => entry.severity === 'error')
    const text = fragment ? rendered.html : wrapPage(rendered, { theme, language })
    return { content: [{ type: 'text', text }, ...(errors.length ? [{ type: 'text', text: JSON.stringify({ errors }, null, 2) }] : [])] }
  },
}

export async function runTool(name, args = {}) {
  const tool = TOOLS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return TOOL_HANDLERS[name](validateArguments(tool.inputSchema, args))
}
