// Engine behind the song2html command-line tool. The Rust binary embeds these
// modules in QuickJS and calls convertJson(), so the CLI and the npm package
// share one parser and renderer.
import { parseSong, serializeSong, transposeSongAst } from './ast.js'
import { renderSongHtml } from './html.js'
import { detectFormat, importSong } from './importers.js'
import { THEMES, wrapPage } from './render.js'

export const INPUT_FORMATS = ['auto', 'song2html', 'chordpro', 'inline-brackets', 'opensong', 'chords-over-lyrics']
export const OUTPUT_FORMATS = ['page', 'fragment', 'json', 'ast', 'song2html', 'arrangements']

/**
 * Converts chart text to the requested output.
 * @param {{ source: string, from?: string, to?: string, arrangement?: string, theme?: string,
 *   language?: string, capo?: number, transpose?: number, sourceName?: string, title?: string, key?: string }} request
 * @returns {{ output: string, diagnostics: object[], format: string|null }}
 */
export function convert(request) {
  const { source, from = 'auto', to = 'page', arrangement = '', theme, language, capo, transpose = 0 } = request
  if (!INPUT_FORMATS.includes(from)) throw new RangeError(`Unknown input format "${from}" (expected ${INPUT_FORMATS.join(', ')})`)
  if (!OUTPUT_FORMATS.includes(to)) throw new RangeError(`Unknown output format "${to}" (expected ${OUTPUT_FORMATS.join(', ')})`)
  if (theme && !THEMES.includes(theme)) throw new RangeError(`Unknown theme "${theme}" (expected ${THEMES.join(', ')})`)

  let song
  let diagnostics
  let format = from
  const detected = from === 'auto' ? detectFormat(source)[0]?.format : from
  if (!detected || detected === 'song2html') {
    ({ song, diagnostics } = parseSong(source))
    format = 'song2html'
  } else {
    const imported = importSong(source, { format: from, sourceName: request.sourceName, title: request.title, key: request.key })
    diagnostics = imported.diagnostics
    format = imported.detectedFormat
    if (!imported.song) return { output: '', diagnostics, format }
    song = imported.song
  }
  if (transpose) song = transposeSongAst(song, transpose)

  if (to === 'ast') return { output: `${JSON.stringify(song, null, 2)}\n`, diagnostics, format }
  if (to === 'song2html') return { output: serializeSong(song), diagnostics, format }
  if (to === 'arrangements') return { output: song.arrangements.map((entry) => `${entry.name}\n`).join(''), diagnostics, format }

  const rendered = renderSongHtml(song, { arrangement, capo })
  diagnostics = [...diagnostics, ...rendered.diagnostics]
  if (to === 'fragment') return { output: `${rendered.html}\n`, diagnostics, format }
  if (to === 'json') return { output: `${JSON.stringify({ html: rendered.html, arrangements: rendered.arrangements, song: rendered.song, errata: diagnostics }, null, 2)}\n`, diagnostics, format }
  return { output: `${wrapPage(rendered, { theme, language })}\n`, diagnostics, format }
}

/** JSON-in/JSON-out wrapper for embedding hosts. Errors are returned, not thrown. */
export function convertJson(requestJson) {
  try {
    return JSON.stringify({ ok: true, ...convert(JSON.parse(requestJson)) })
  } catch (error) {
    return JSON.stringify({ ok: false, error: `${error.name}: ${error.message}` })
  }
}
