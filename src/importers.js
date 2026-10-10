import { METADATA_KEYS, assertSourceLimits, createSongAst, isReservedName, parseSong, serializeSong, splitLines, validateSong } from './ast.js'
import { formatChord, parseChord } from './theory.js'

const diag = (severity, code, message, line, column = 1) => ({ severity, code, type: code.toLowerCase().replaceAll('_', '-'), message, location: { line, column, length: 1 }, line })
const chordToken = (value) => {
  const notation = parseChord(value).notation
  return notation !== 'unknown'
}
const decodeXml = (value = '') => value
  .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const SECTION_WORDS = 'intro|verse|pre-?chorus|pre chorus|chorus|post-?chorus|bridge|tag|outro|ending|interlude|instrumental|refrain|solo|coda|vamp|turnaround|break|hook'
const SECTION_HEADER_RE = new RegExp(`^(?:${SECTION_WORDS})(?:\\s*\\d+)?(?:\\s*\\(?\\s*x?\\d+x?\\s*\\)?)?\\s*:?$`, 'i')
// Repeat signs and rhythm slashes that may sit between chords on a chord line.
// Bar lines split tokens (`|G D|C`) before this check.
const BAR_TOKEN_RE = /^(?:\/+|%|-+|\(?x\d+\)?|\(?\d+x\)?|\.+)$/i

const normalizeChordToken = (value) => String(value).replace(/^[,:]+/, '').replace(/[,:]+$/, '')
const isTabLine = (line) => /^[eEBGDA]\|[-\d\s|xhpbvr~/\\]+$/.test(line.trim())
// '^' marks chord positions and '<transpose …>'/'<chords …>' lines are directives in
// song2html source, so literal occurrences in imported lyrics are replaced by look-alikes.
const protectCarets = (text) => text.replaceAll('^', 'ˆ').replace(/^(\s*)<(?=(?:transpose|chords)\b[^>]*>\s*$)/i, '$1‹')

/** Chord-line tokens with their source columns. */
function chordLineTokens(line) {
  const tokens = []
  for (const match of line.matchAll(/[^\s|]+/g)) {
    if (BAR_TOKEN_RE.test(match[0])) continue
    const token = normalizeChordToken(match[0])
    if (token) tokens.push({ token, index: match.index + match[0].indexOf(token) })
  }
  return tokens
}

export function isChordLine(line) {
  if (isTabLine(line)) return false
  const tokens = chordLineTokens(line)
  return tokens.length > 0 && tokens.every((entry) => chordToken(entry.token))
}

const expandTabs = (line, width) => {
  if (!line.includes('\t')) return line
  let output = ''
  for (const character of line) output += character === '\t' ? ' '.repeat(width - (output.length % width)) : character
  return output
}

// Shared song builder -------------------------------------------------------------

const titleCase = (value) => value.replace(/(^|[\s-])(\p{Letter})/gu, (_, separator, letter) => separator + letter.toUpperCase())

function sanitizeSectionName(name) {
  let clean = String(name || '').replace(/[:\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Part'
  if (isReservedName(clean) || /^(?:sections|arrangements)$/i.test(clean)) clean = `${clean} Section`
  return clean
}

function definitionBase(kind) {
  let base = String(kind || '').normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}-]+/gu, '-').replace(/^-+|-+$/g, '') || 'part'
  if (METADATA_KEYS.includes(base) || isReservedName(base) || base === 'sections' || base === 'arrangements') base = `${base}-part`
  return base
}

/**
 * Builds a Song AST from importer output so that it serializes to song2html source
 * which parses back to the same song: section names are unique and colon-free, and
 * each section links to a chord definition by name (`<chords …>` when the name differs
 * from the section's first word). Sections with identical progressions share a definition.
 * @param {{ metadata: object, sections: Array<{ name: string, kind?: string, lyrics: string[], chords: string[] }>, order?: number[] }} input
 */
export function buildImportedSong({ metadata, sections, order = null }) {
  const usedNames = new Set()
  const definitions = new Map() // name -> tokens
  const chords = {}
  const songSections = sections.map((section) => {
    let name = sanitizeSectionName(section.name)
    for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix++) name = `${sanitizeSectionName(section.name)} ${suffix}`
    usedNames.add(name.toLowerCase())
    let definition = null
    if (section.chords.length) {
      const tokens = section.chords.map((chord) => formatChord(parseChord(chord)))
      const base = definitionBase(section.kind || name.split(/\s+/)[0])
      for (let suffix = 1; ; suffix++) {
        const candidate = suffix === 1 ? base : `${base}${suffix}`
        const existing = definitions.get(candidate)
        if (!existing) { definitions.set(candidate, tokens); chords[candidate] = tokens; definition = candidate; break }
        if (existing.join(' ') === tokens.join(' ')) { definition = candidate; break }
      }
    }
    return { name, lyrics: section.lyrics, chords: definition }
  })
  const arrangements = order && (order.length !== sections.length || order.some((value, index) => value !== index))
    ? { default: order.map((index) => songSections[index].name) }
    : undefined
  return createSongAst({ ...metadata, chords, sections: songSections, arrangements })
}

function finish(song, format, diagnostics, confidence, sourceName, mapping = []) {
  song.provenance = { format, sourceName: sourceName || null, warnings: diagnostics.filter((entry) => entry.severity === 'warning').length }
  diagnostics.push(...validateSong(song))
  return { detectedFormat: format, confidence, song, song2htmlSource: serializeSong(song), diagnostics, mapping }
}

function splitInline(line, lineNumber, diagnostics) {
  const chords = []
  let lyric = ''
  let cursor = 0
  const matcher = /\[([^\]]+)]/g
  let match
  while ((match = matcher.exec(line))) {
    lyric += protectCarets(line.slice(cursor, match.index))
    const chord = match[1].trim()
    if (!chordToken(chord)) {
      diagnostics.push(diag('warning', 'UNRECOGNIZED_CHORD_TOKEN', `Unrecognized inline chord "${chord}"`, lineNumber, match.index + 2))
      lyric += protectCarets(match[0])
    } else {
      chords.push(chord)
      lyric += '^'
    }
    cursor = matcher.lastIndex
  }
  lyric += protectCarets(line.slice(cursor))
  return { lyric, chords }
}

function snapCaretColumn(lyricLine, column, diagnostics, chord, lineNumber) {
  if (column >= lyricLine.length) {
    if (column > lyricLine.length) diagnostics.push(diag('warning', 'CHORD_BEYOND_LYRIC', `Chord ${chord} lies beyond the lyric line and was attached at the end`, lineNumber, column + 1))
    return lyricLine.length
  }
  if (/\s/.test(lyricLine[column] || '')) {
    let next = column
    while (next < lyricLine.length && /\s/.test(lyricLine[next])) next++
    diagnostics.push(diag('info', 'SNAP_TO_FOLLOWING_WORD', `Chord ${chord} fell in whitespace and was attached to the following word`, lineNumber, column + 1))
    return next
  }
  let start = column
  while (start > 0 && !/\s/.test(lyricLine[start - 1])) start--
  if (column - start > 0 && column - start <= 2) {
    diagnostics.push(diag('info', 'SNAP_TO_WORD_START', `Chord ${chord} was within two characters of a word start and snapped to it`, lineNumber, column + 1))
    return start
  }
  return column
}

/**
 * Places chords from a chord line onto the lyric line below it.
 * align 'word' (default) snaps chords to word starts; 'column' keeps source columns.
 */
function alignChords(chordLine, lyricLine, lineNumber, diagnostics, align = 'word') {
  const events = chordLineTokens(chordLine).filter((entry) => chordToken(entry.token))
  let output = protectCarets(lyricLine)
  const length = lyricLine.length
  let offset = 0
  for (const event of events) {
    let column = Math.min(event.index, length)
    if (align === 'word') column = snapCaretColumn(lyricLine, event.index, diagnostics, event.token, lineNumber)
    else {
      if (event.index > length) diagnostics.push(diag('warning', 'CHORD_BEYOND_LYRIC', `Chord ${event.token} lies beyond the lyric line and was attached at the end`, lineNumber, event.index + 1))
      if (/\s/.test(lyricLine[column] || '') && column > 0 && column < length) diagnostics.push(diag('warning', 'AMBIGUOUS_CHORD_ALIGNMENT', `Chord ${event.token} falls in whitespace; its source column was preserved`, lineNumber, event.index + 1))
    }
    output = output.slice(0, column + offset) + '^' + output.slice(column + offset)
    offset++
  }
  return { lyric: output, chords: events.map((event) => event.token) }
}

/** Chord-only line (intro, turnaround): keep the chords as an instrumental caret line. */
function instrumentalLine(chordLine, lineNumber, diagnostics) {
  const events = chordLineTokens(chordLine).filter((entry) => chordToken(entry.token))
  diagnostics.push(diag('info', 'INSTRUMENTAL_CHORD_LINE', 'Chord line has no following lyric line; imported as instrumental carets', lineNumber))
  return { lyric: events.map(() => '^').join(' '), chords: events.map((event) => event.token) }
}

// Format detection -------------------------------------------------------------------

export function detectFormat(source) {
  assertSourceLimits(source)
  const candidates = []
  const chordProDirectives = (source.match(/\{(?:title|t|key|artist|author|composer|start_of_|end_of_|soc|sov|sob|eoc|eov|eob|comment|c|tempo|capo)\s*[:}]/gi) || []).length
  const inlineChords = [...source.matchAll(/\[([^\]\n]{1,24})\]/g)].filter((match) => chordToken(match[1].trim())).length
  if (chordProDirectives) candidates.push({ format: 'chordpro', confidence: Math.min(0.99, 0.78 + chordProDirectives * 0.04 + (inlineChords ? 0.1 : 0)), evidence: [`Found ${chordProDirectives} ChordPro directives`] })
  if (/<song[\s>]/i.test(source) && /<(title|lyrics|presentation)>/i.test(source)) candidates.push({ format: 'opensong', confidence: 0.99, evidence: ['Found OpenSong XML song structure'] })
  if (/^\s*Sections:\s*$/mi.test(source)) candidates.push({ format: 'song2html', confidence: 0.99, evidence: ['Found Sections: header'] })
  if (inlineChords) candidates.push({ format: 'inline-brackets', confidence: Math.min(0.95, 0.55 + inlineChords * 0.05), evidence: [`Found ${inlineChords} inline chord tokens`] })
  const lines = splitLines(source)
  let paired = 0
  for (let index = 0; index < lines.length - 1; index++) if (isChordLine(lines[index]) && lines[index + 1].trim() && !isChordLine(lines[index + 1])) paired++
  if (paired) candidates.push({ format: 'chords-over-lyrics', confidence: Math.min(0.9, 0.5 + paired * 0.08), evidence: [`Found ${paired} chord/lyric line pairs`] })
  return candidates.sort((left, right) => right.confidence - left.confidence)
}

// ChordPro ---------------------------------------------------------------------------

const CHORDPRO_IGNORED = new Set(['comment', 'c', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight', 'new_page', 'np', 'new_physical_page', 'npp', 'column_break', 'colb', 'columns', 'col'])
const CHORDPRO_SHORT = { sov: 'verse', soc: 'chorus', sob: 'bridge', sot: 'tab', sog: 'grid', eov: 'verse', eoc: 'chorus', eob: 'bridge', eot: 'tab', eog: 'grid' }

export function importChordPro(source, options = {}) {
  assertSourceLimits(source)
  const diagnostics = []
  const mapping = []
  const metadata = { title: '', key: null, authors: [], owner: null, license: null, tempo: null, time: null, capo: null }
  const sections = []
  const order = []
  let current = null
  let skipping = null
  const close = () => {
    if (current && (current.lyrics.length || current.chords.length)) { order.push(sections.length); sections.push(current) }
    current = null
  }
  const open = (kind, label, implicit = false) => { close(); current = { name: label || titleCase(kind.replaceAll('_', ' ')), kind, lyrics: [], chords: [], implicit } }
  const lines = splitLines(source)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    const directive = trimmed.match(/^\{\s*([A-Za-z_]+)(?:\s*[:\s]\s*(.*?))?\s*}$/)
    if (directive) {
      const name = directive[1].toLowerCase()
      const value = (directive[2] || '').trim()
      const label = value.match(/label\s*=\s*"([^"]*)"/)?.[1] ?? (/^\w+\s*=/.test(value) ? '' : value)
      const environment = CHORDPRO_SHORT[name] || name.match(/^(?:start|end)_of_(\w+)$/)?.[1]
      if (['title', 't'].includes(name)) metadata.title = value
      else if (name === 'key') metadata.key = value
      else if (['artist', 'composer', 'lyricist', 'author'].includes(name)) metadata.authors.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      else if (['copyright', 'owner'].includes(name)) metadata.owner = value
      else if (name === 'license') metadata.license = value
      else if (name === 'tempo') metadata.tempo = /^\d{1,3}$/.test(value) ? Number(value) : null
      else if (name === 'time') metadata.time = value || null
      else if (name === 'capo') metadata.capo = /^\d{1,2}$/.test(value) && Number(value) <= 11 ? Number(value) : null
      else if (environment && /^(start_of_|so)/.test(name)) {
        if (environment === 'tab' || environment === 'grid') {
          close()
          skipping = environment
          diagnostics.push(diag('info', 'UNSUPPORTED_BLOCK', `ChordPro ${environment} block was not imported`, index + 1))
        } else open(environment, label)
      } else if (environment && /^(end_of_|eo)/.test(name)) {
        if (skipping) skipping = null
        else close()
      } else if (name === 'chorus') {
        close()
        const chorus = sections.findLastIndex((section) => section.kind === 'chorus')
        if (chorus >= 0) order.push(chorus)
        else diagnostics.push(diag('warning', 'CHORUS_REFERENCE_WITHOUT_CHORUS', '{chorus} appears before any chorus is defined', index + 1))
      } else if (!CHORDPRO_IGNORED.has(name)) diagnostics.push(diag('info', 'UNSUPPORTED_DIRECTIVE', `Preserved no data for ChordPro directive {${directive[1]}}`, index + 1))
      continue
    }
    if (skipping || trimmed.startsWith('#')) continue
    if (!trimmed) {
      if (current?.implicit) close()
      continue
    }
    if (!current) open('part', 'Part', true)
    const converted = splitInline(line, index + 1, diagnostics)
    current.lyrics.push(converted.lyric)
    current.chords.push(...converted.chords)
    mapping.push({ sourceLine: index + 1, section: current.name, chordCount: converted.chords.length })
  }
  close()
  const song = buildImportedSong({ metadata: { ...metadata, title: options.title || metadata.title, key: options.key || metadata.key }, sections, order })
  return finish(song, 'chordpro', diagnostics, 0.99, options.sourceName, mapping)
}

// Inline brackets --------------------------------------------------------------------

function readInlineSections(source, options, diagnostics) {
  const lines = splitLines(source)
  let title = options.title || ''
  const sections = []
  let current = { name: 'Part', lyrics: [], chords: [] }
  const flush = () => { if (current.lyrics.length) sections.push(current) }
  const mapping = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const header = line.trim().match(/^\[([^\]]+)]\s*:?$/)
    if (header && !chordToken(header[1].trim())) { flush(); current = { name: options.sectionName?.(header[1].trim()) ?? header[1].trim(), lyrics: [], chords: [] }; continue }
    if (!line.includes('[')) {
      if (!title && line.trim()) title = line.trim()
      else if (line.trim()) current.lyrics.push(protectCarets(line))
      continue
    }
    const converted = splitInline(line, index + 1, diagnostics)
    current.lyrics.push(converted.lyric)
    current.chords.push(...converted.chords)
    mapping.push({ sourceLine: index + 1, section: current.name, chordCount: converted.chords.length })
  }
  flush()
  return { title, sections, mapping }
}

export function importInlineBrackets(source, options = {}) {
  assertSourceLimits(source)
  const diagnostics = []
  const { title, sections, mapping } = readInlineSections(source, options, diagnostics)
  const song = buildImportedSong({ metadata: { title: title || 'Imported Song', key: options.key }, sections })
  return finish(song, 'inline-brackets', diagnostics, 0.95, options.sourceName, mapping)
}

// Chords over lyrics -----------------------------------------------------------------

// Strict headers: bracketed names and known section words ("Verse 2", "Chorus:").
function strictHeaderName(trimmed) {
  const bracketed = trimmed.match(/^\[([^\]]+)]:?$/)
  if (bracketed && !chordToken(bracketed[1].trim())) return bracketed[1].trim()
  if (SECTION_HEADER_RE.test(trimmed)) return trimmed.replace(/:$/, '').trim()
  return null
}

// Standalone lines may also use any "Name:" header. Directly under a chord line only
// strict headers count, so a lyric ending in a colon keeps its chords.
function sectionHeaderName(trimmed) {
  const strict = strictHeaderName(trimmed)
  if (strict) return strict
  const generic = trimmed.match(/^([^:]+):$/)
  return generic && !chordToken(generic[1].trim()) && !isChordLine(trimmed) ? generic[1].trim() : null
}

export function importChordsOverLyrics(source, options = {}) {
  assertSourceLimits(source)
  const diagnostics = []
  const tabWidth = options.tabWidth || 8
  const align = options.align === 'column' ? 'column' : 'word'
  const lines = splitLines(source).map((line) => expandTabs(line, tabWidth))
  const metadata = { key: options.key || null, authors: [], tempo: null, time: null }
  let title = options.title || ''
  const titleFromName = () => (options.sourceName ? String(options.sourceName).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() : '')
  const sections = []
  let current = { name: 'Part', lyrics: [], chords: [] }
  const flush = () => { if (current.lyrics.length || current.chords.length) sections.push(current) }
  const mapping = []
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (!trimmed || isTabLine(lines[index])) continue
    const meta = trimmed.match(/^(key|tempo|time|author|artist|writer|composer)\s*:\s*(.+)$/i)
    if (meta) {
      const tag = meta[1].toLowerCase()
      const value = meta[2].trim()
      if (tag === 'key') metadata.key ||= value
      else if (tag === 'tempo') metadata.tempo = /^\d{1,3}$/.test(value) ? Number(value) : metadata.tempo
      else if (tag === 'time') metadata.time = value
      else metadata.authors.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      continue
    }
    const header = sectionHeaderName(trimmed)
    if (header && !isChordLine(trimmed)) { flush(); current = { name: header, lyrics: [], chords: [] }; continue }
    if (isChordLine(lines[index])) {
      const next = lines[index + 1]
      const hasLyric = next != null && next.trim() && !isChordLine(next) && !isTabLine(next) && !strictHeaderName(next.trim())
      const chordLineNumber = index + 1
      const converted = hasLyric ? alignChords(lines[index], lines[++index], index + 1, diagnostics, align) : instrumentalLine(lines[index], chordLineNumber, diagnostics)
      current.lyrics.push(converted.lyric)
      current.chords.push(...converted.chords)
      mapping.push({ sourceLine: chordLineNumber, lyricLine: hasLyric ? index + 1 : null, section: current.name, chordCount: converted.chords.length })
    } else if (!title && !current.lyrics.length && !sections.length) title = trimmed
    else current.lyrics.push(protectCarets(lines[index]))
  }
  flush()
  const song = buildImportedSong({
    metadata: { title: title || titleFromName() || 'Imported Song', key: metadata.key, authors: metadata.authors, tempo: metadata.tempo, time: metadata.time },
    sections,
  })
  return finish(song, 'chords-over-lyrics', diagnostics, 0.8, options.sourceName, mapping)
}

// OpenSong -----------------------------------------------------------------------------

const OPENSONG_SECTIONS = { V: 'Verse', C: 'Chorus', B: 'Bridge', P: 'Pre-Chorus', T: 'Tag', I: 'Intro', O: 'Outro', E: 'Ending' }

function openSongSectionName(code) {
  const match = code.match(/^([A-Za-z])(\d*)$/)
  if (!match || !OPENSONG_SECTIONS[match[1].toUpperCase()]) return code
  return `${OPENSONG_SECTIONS[match[1].toUpperCase()]}${match[2] ? ` ${match[2]}` : ''}`
}

export function importOpenSong(source, options = {}) {
  assertSourceLimits(source)
  const diagnostics = []
  const value = (tag) => decodeXml(source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '').trim()
  const title = options.title || value('title') || 'Imported Song'
  const key = options.key || value('key') || null
  const authors = value('author').split(/[,;]+/).map((item) => item.trim()).filter(Boolean)
  const tempo = /^\d{1,3}$/.test(value('tempo')) ? Number(value('tempo')) : null
  const capoValue = value('capo')
  const metadata = { title, key, authors, owner: value('copyright') || null, tempo, time: value('time_sig') || value('timesig') || null, capo: /^\d{1,2}$/.test(capoValue) && Number(capoValue) <= 11 ? Number(capoValue) : null }
  const lyrics = decodeXml(source.match(/<lyrics(?:\s[^>]*)?>([\s\S]*?)<\/lyrics>/i)?.[1] || '')
  if (!lyrics.trim()) diagnostics.push(diag('error', 'MISSING_LYRICS', 'OpenSong document has no lyrics element', 1))
  const lines = lyrics.replace(/\r\n?/g, '\n').split('\n')

  // Some exports put inline [G] chords in the lyrics instead of '.'-prefixed chord lines.
  if (!lines.some((line) => line.startsWith('.')) && lines.some((line) => /\[[^\]]+][^\s]/.test(line))) {
    const inline = readInlineSections(lines.map((line) => line.replace(/^ /, '')).join('\n'), { title, sectionName: openSongSectionName }, diagnostics)
    const song = buildImportedSong({ metadata, sections: inline.sections })
    return finish(song, 'opensong', diagnostics, 0.99, options.sourceName, inline.mapping)
  }

  const sections = []
  const codes = new Map()
  const mapping = []
  let current = null
  const flush = () => { if (current && (current.lyrics.length || current.chords.length)) { codes.set(current.code, sections.length); sections.push(current) } }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const header = line.trim().match(/^\[([^\]]+)]$/)
    if (header) {
      flush()
      current = { code: header[1].trim(), name: openSongSectionName(header[1].trim()), lyrics: [], chords: [] }
      continue
    }
    if (!line.trim() || line.startsWith(';') || /^-+$/.test(line.trim())) continue
    current ??= { code: 'V', name: 'Verse', lyrics: [], chords: [] }
    if (line.startsWith('.')) {
      const chordLine = line.slice(1)
      const next = lines[index + 1]
      const hasLyric = next != null && /^[ 1-9]/.test(next) && next.trim()
      const converted = hasLyric ? alignChords(chordLine, next.slice(1).replace(/\|+/g, ' '), index + 2, diagnostics, options.align === 'column' ? 'column' : 'word') : instrumentalLine(chordLine, index + 1, diagnostics)
      if (hasLyric) index++
      current.lyrics.push(converted.lyric)
      current.chords.push(...converted.chords)
      mapping.push({ sourceLine: index + 1, section: current.name, chordCount: converted.chords.length })
    } else if (/^[ 1-9]/.test(line)) {
      if (/^[1-9]/.test(line)) diagnostics.push(diag('info', 'MULTI_VERSE_LINE', 'Numbered OpenSong verse lines are imported as plain lyric lines', index + 1))
      current.lyrics.push(protectCarets(line.slice(1).replace(/\|+/g, ' ')))
    } else current.lyrics.push(protectCarets(line))
  }
  flush()

  let order = null
  const presentation = value('presentation').split(/\s+/).filter(Boolean)
  if (presentation.length) {
    order = []
    for (const code of presentation) {
      if (codes.has(code)) order.push(codes.get(code))
      else diagnostics.push(diag('warning', 'UNKNOWN_PRESENTATION_SECTION', `Presentation references unknown section "${code}"`, 1))
    }
    if (!order.length) order = null
  }
  const song = buildImportedSong({ metadata, sections, order })
  return finish(song, 'opensong', diagnostics, 0.99, options.sourceName, mapping)
}

// Dispatcher ----------------------------------------------------------------------------

const IMPORTERS = { chordpro: importChordPro, 'inline-brackets': importInlineBrackets, 'chords-over-lyrics': importChordsOverLyrics, opensong: importOpenSong }

export function importSong(source, options = {}) {
  let format = options.format || 'auto'
  let candidates = []
  if (format === 'auto') {
    candidates = detectFormat(source)
    if (!candidates.length) return { detectedFormat: null, confidence: 0, song: null, song2htmlSource: null, diagnostics: [diag('error', 'UNKNOWN_FORMAT', 'Could not determine the source chart format', 1)], candidates }
    if (candidates.length > 1 && candidates[0].confidence - candidates[1].confidence < 0.1) return { detectedFormat: null, confidence: candidates[0].confidence, song: null, song2htmlSource: null, diagnostics: [diag('error', 'AMBIGUOUS_FORMAT', `Format is ambiguous between ${candidates[0].format} and ${candidates[1].format}; select one explicitly`, 1)], candidates }
    format = candidates[0].format
  }
  if (IMPORTERS[format]) return { ...IMPORTERS[format](source, options), candidates }
  if (format === 'song2html') {
    const parsed = parseSong(source)
    return { detectedFormat: 'song2html', confidence: 0.99, song: parsed.song, song2htmlSource: serializeSong(parsed.song), diagnostics: parsed.diagnostics, candidates }
  }
  throw new Error(`Unsupported import format: ${format}`)
}
