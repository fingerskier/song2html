import { parseSong } from './src/ast.js'
import { renderSongHtml } from './src/html.js'

export { LIMITS, createSongAst, defaultArrangement, formatChord, formatKey, parseChord, parseKey, parseSong, semanticSong, serializeSong, transposeSongAst, validateSong } from './src/ast.js'
export { detectFormat, importChordPro, importChordsOverLyrics, importInlineBrackets, importOpenSong, importSong } from './src/importers.js'
export { renderSongHtml } from './src/html.js'
export { previewPlain, renderStandalone, THEMES } from './src/render.js'
export { resolveChord, transposeKey } from './src/theory.js'

/**
 * Converts a song source file into HTML markup with chord notation and lyrics.
 * @param {string} source - The raw song source text containing metadata, chords, lyrics, and arrangements.
 * @param {string} [arrangementName=''] - Optional name of the arrangement to use. Defaults to the first available arrangement.
 * @param {{ capo?: number }} [options] - Render options. `capo` shows chord shapes for a capo on fret N (overrides `capo:` metadata).
 * @returns {{ html: string, arrangements: string[], song: { title: string, key: string|null, tempo: number|null, authors: string[], time: string|null, owner: string|null, license: string|null, capo: number|null }, errata: Array<{ severity: string, code: string, type: string, message: string, section?: string, line?: number }> }} An object containing the generated HTML, available arrangement names, song metadata, and parsing errata.
 */
export default function songToHtml(source, arrangementName = '', options = {}) {
  const { song, diagnostics } = parseSong(source)
  const rendered = renderSongHtml(song, { ...options, arrangement: arrangementName })
  return { html: rendered.html, arrangements: rendered.arrangements, song: rendered.song, errata: [...diagnostics, ...rendered.diagnostics] }
}
