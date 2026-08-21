import { createSongAst, parseChord, parseSong, serializeSong, validateSong } from './ast.js'

const diag = (severity, code, message, line, column = 1) => ({ severity, code, type: code.toLowerCase().replaceAll('_', '-'), message, location: { line, column, length: 1 }, line })
const chordToken = (value) => parseChord(value).notation !== 'unknown'
const decodeXml = (value = '') => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export function detectFormat(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  if (source.length > 1_000_000) throw new RangeError('source exceeds 1000000 characters')
  const candidates = []
  const chordProDirectives = (source.match(/\{(?:title|t|key|artist|author|composer|start_of_|end_of_|soc|sov|sob|eoc|eov|eob|comment)\s*:/gi) || []).length
  const inlineChords = (source.match(/\[(?:[A-G][#b]?(?:m|maj|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?|[1-7](?:\/[1-7])?)\]/g) || []).length
  if (chordProDirectives) candidates.push({ format: 'chordpro', confidence: Math.min(0.99, 0.78 + chordProDirectives * 0.04 + (inlineChords ? 0.1 : 0)), evidence: [`Found ${chordProDirectives} ChordPro directives`] })
  if (/<song[\s>]/i.test(source) && /<(title|lyrics|presentation)>/i.test(source)) candidates.push({ format: 'opensong', confidence: 0.99, evidence: ['Found OpenSong XML song structure'] })
  if (/^\s*Sections:\s*$/mi.test(source)) candidates.push({ format: 'song2html', confidence: 0.99, evidence: ['Found Sections: header'] })
  if (inlineChords) candidates.push({ format: 'inline-brackets', confidence: Math.min(0.95, 0.55 + inlineChords * 0.05), evidence: [`Found ${inlineChords} inline chord tokens`] })
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let paired = 0
  for (let index = 0; index < lines.length - 1; index++) if (isChordLine(lines[index]) && lines[index + 1].trim() && !isChordLine(lines[index + 1])) paired++
  if (paired) candidates.push({ format: 'chords-over-lyrics', confidence: Math.min(0.9, 0.5 + paired * 0.08), evidence: [`Found ${paired} chord/lyric line pairs`] })
  return candidates.sort((left, right) => right.confidence - left.confidence)
}

function isChordLine(line) {
  const values = line.trim().split(/\s+/).filter(Boolean)
  return values.length > 0 && values.every((value) => chordToken(value.replace(/[|,:]+$/g, '')))
}

function splitInline(line, lineNumber, diagnostics) {
  const chords = []
  let lyric = ''
  let cursor = 0
  const matcher = /\[([^\]]+)]/g
  let match
  while ((match = matcher.exec(line))) {
    lyric += line.slice(cursor, match.index)
    const chord = match[1].trim()
    if (!chordToken(chord)) {
      diagnostics.push(diag('warning', 'UNRECOGNIZED_CHORD_TOKEN', `Unrecognized inline chord "${chord}"`, lineNumber, match.index + 2))
      lyric += match[0]
    } else {
      chords.push(chord)
      lyric += '^'
    }
    cursor = matcher.lastIndex
  }
  lyric += line.slice(cursor)
  return { lyric, chords }
}

function finish(song, format, diagnostics, confidence, sourceName, mapping = []) {
  song.provenance = { format, sourceName: sourceName || null, warnings: diagnostics.filter((entry) => entry.severity === 'warning').length }
  diagnostics.push(...validateSong(song))
  return { detectedFormat: format, confidence, song, song2htmlSource: serializeSong(song), diagnostics, mapping }
}

export function importChordPro(source, options = {}) {
  const diagnostics = []
  const metadata = { title: '', key: null, authors: [], owner: null, license: null }
  const sectionData = []
  let current = { name: 'Song', lyrics: [], chords: [] }
  const flush = () => { if (current.lyrics.length || current.chords.length) sectionData.push(current); current = { name: `Section ${sectionData.length + 1}`, lyrics: [], chords: [] } }
  const mapping = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const directive = line.trim().match(/^\{([^}:]+)(?::\s*(.*?))?}$/)
    if (directive) {
      const name = directive[1].toLowerCase(); const value = directive[2] || ''
      if (['title', 't'].includes(name)) metadata.title = value
      else if (name === 'key') metadata.key = value
      else if (['artist', 'composer', 'author'].includes(name)) metadata.authors.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      else if (['copyright', 'owner'].includes(name)) metadata.owner = value
      else if (name === 'license') metadata.license = value
      else if (/^(start_of_|so[vcb])/.test(name)) { flush(); current.name = value || ({ sov: 'Verse', soc: 'Chorus', sob: 'Bridge' }[name] || name.replace(/^start_of_/, '').replaceAll('_', ' ')) }
      else if (/^(end_of_|eo[vcb])/.test(name)) flush()
      else if (!['comment', 'c', 'new_page', 'np'].includes(name)) diagnostics.push(diag('info', 'UNSUPPORTED_DIRECTIVE', `Preserved no data for ChordPro directive {${directive[1]}}`, index + 1))
      continue
    }
    if (!line.trim()) continue
    const converted = splitInline(line, index + 1, diagnostics)
    current.lyrics.push(converted.lyric)
    current.chords.push(...converted.chords)
    mapping.push({ sourceLine: index + 1, section: current.name, chordCount: converted.chords.length })
  }
  flush()
  const chords = {}; const sections = []
  sectionData.forEach((section, index) => { const definition = `part${index + 1}`; chords[definition] = section.chords; sections.push({ name: `${definition} ${section.name}`, lyrics: section.lyrics }) })
  const song = createSongAst({ ...metadata, chords, sections, provenance: { format: 'chordpro' } })
  song.sections.forEach((section, index) => { section.name = sectionData[index].name; section.chordDefinitionId = song.chordDefinitions[index]?.id || null })
  return finish(song, 'chordpro', diagnostics, 0.99, options.sourceName, mapping)
}

export function importInlineBrackets(source, options = {}) {
  const diagnostics = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let title = options.title || ''
  const sections = []; let current = { name: 'Song', lyrics: [], chords: [] }
  const flush = () => { if (current.lyrics.length) sections.push(current); current = { name: `Section ${sections.length + 1}`, lyrics: [], chords: [] } }
  const mapping = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const header = line.trim().match(/^\[([^\]]+)]\s*$/)
    if (header && !chordToken(header[1])) { flush(); current.name = header[1]; continue }
    if (!line.includes('[')) { if (!title && line.trim()) title = line.trim(); else if (line.trim()) current.lyrics.push(line); continue }
    const converted = splitInline(line, index + 1, diagnostics)
    current.lyrics.push(converted.lyric); current.chords.push(...converted.chords)
    mapping.push({ sourceLine: index + 1, section: current.name, chordCount: converted.chords.length })
  }
  flush()
  const chords = {}; const songSections = []
  sections.forEach((section, index) => { const name = `part${index + 1}`; chords[name] = section.chords; songSections.push({ name: section.name, lyrics: section.lyrics, chordDefinitionId: `chords-${name}-${index + 1}` }) })
  const song = createSongAst({ title: title || 'Imported Song', key: options.key, chords, sections: songSections })
  song.sections.forEach((section, index) => { section.chordDefinitionId = song.chordDefinitions[index]?.id || null })
  return finish(song, 'inline-brackets', diagnostics, 0.95, options.sourceName, mapping)
}

export function importChordsOverLyrics(source, options = {}) {
  const diagnostics = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let title = options.title || ''
  const sections = []; let current = { name: 'Song', lyrics: [], chords: [] }
  const flush = () => { if (current.lyrics.length || current.chords.length) sections.push(current); current = { name: `Section ${sections.length + 1}`, lyrics: [], chords: [] } }
  const mapping = []
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    const header = trimmed.match(/^\[([^\]]+)]$/) || trimmed.match(/^([^:]+):$/)
    if (header && !isChordLine(trimmed)) { flush(); current.name = header[1].trim(); continue }
    if (isChordLine(lines[index])) {
      if (index + 1 >= lines.length || !lines[index + 1].trim() || isChordLine(lines[index + 1])) {
        diagnostics.push(diag('warning', 'CHORD_LINE_WITHOUT_LYRIC', 'Chord line has no following lyric line', index + 1)); continue
      }
      const chordLine = lines[index]; const lyricLine = lines[++index]
      const events = [...chordLine.matchAll(/\S+/g)].filter((match) => chordToken(match[0].replace(/[|,:]+$/g, '')))
      let output = lyricLine
      let offset = 0
      for (const event of events) {
        const chord = event[0].replace(/[|,:]+$/g, '')
        let column = Math.min(event.index, lyricLine.length)
        if (column === lyricLine.length && event.index > lyricLine.length) diagnostics.push(diag('warning', 'CHORD_BEYOND_LYRIC', `Chord ${chord} lies beyond the lyric line and was attached at the end`, index, event.index + 1))
        if (/\s/.test(lyricLine[column] || '') && column > 0 && column < lyricLine.length) diagnostics.push(diag('warning', 'AMBIGUOUS_CHORD_ALIGNMENT', `Chord ${chord} falls in whitespace; its source column was preserved`, index, event.index + 1))
        output = output.slice(0, column + offset) + '^' + output.slice(column + offset); offset++
        current.chords.push(chord)
      }
      current.lyrics.push(output)
      mapping.push({ sourceLine: index, lyricLine: index + 1, section: current.name, chordCount: events.length })
    } else if (trimmed) {
      if (!title && !current.lyrics.length && !sections.length) title = trimmed
      else current.lyrics.push(lines[index])
    }
  }
  flush()
  const chords = {}; const songSections = []
  sections.forEach((section, index) => { const name = `part${index + 1}`; chords[name] = section.chords; songSections.push({ name: section.name, lyrics: section.lyrics }) })
  const song = createSongAst({ title: title || 'Imported Song', key: options.key, chords, sections: songSections })
  song.sections.forEach((section, index) => { section.chordDefinitionId = song.chordDefinitions[index]?.id || null })
  return finish(song, 'chords-over-lyrics', diagnostics, 0.8, options.sourceName, mapping)
}

export function importOpenSong(source, options = {}) {
  const diagnostics = []
  const value = (tag) => decodeXml(source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() || '')
  const title = value('title') || 'Imported Song'; const key = value('key') || null
  const authors = value('author').split(/[,;]+/).map((item) => item.trim()).filter(Boolean)
  const lyrics = value('lyrics')
  if (!lyrics) diagnostics.push(diag('error', 'MISSING_LYRICS', 'OpenSong document has no lyrics element', 1))
  const inline = importInlineBrackets(lyrics.replace(/^\s*\[([A-Za-z][^\]]*)]\s*$/gm, '[$1]'), { title, key, sourceName: options.sourceName })
  inline.song.metadata.authors = authors
  inline.song.metadata.owner = value('copyright') || null
  inline.song.metadata.tempo = /^\d+$/.test(value('tempo')) ? Number(value('tempo')) : null
  inline.song.provenance = { format: 'opensong', sourceName: options.sourceName || null, warnings: diagnostics.length }
  return { ...inline, detectedFormat: 'opensong', confidence: 0.99, song2htmlSource: serializeSong(inline.song), diagnostics: [...diagnostics, ...inline.diagnostics] }
}

export function importSong(source, options = {}) {
  let format = options.format || 'auto'
  const detected = detectFormat(source)
  if (format === 'auto') {
    if (!detected.length) return { detectedFormat: null, confidence: 0, song: null, song2htmlSource: null, diagnostics: [diag('error', 'UNKNOWN_FORMAT', 'Could not determine the source chart format', 1)], candidates: [] }
    if (detected.length > 1 && detected[0].confidence - detected[1].confidence < 0.1) return { detectedFormat: null, confidence: detected[0].confidence, song: null, song2htmlSource: null, diagnostics: [diag('error', 'AMBIGUOUS_FORMAT', `Format is ambiguous between ${detected[0].format} and ${detected[1].format}; select one explicitly`, 1)], candidates: detected }
    format = detected[0].format
  }
  if (format === 'chordpro') return { ...importChordPro(source, options), candidates: detected }
  if (format === 'inline-brackets') return { ...importInlineBrackets(source, options), candidates: detected }
  if (format === 'chords-over-lyrics') return { ...importChordsOverLyrics(source, options), candidates: detected }
  if (format === 'opensong') return { ...importOpenSong(source, options), candidates: detected }
  if (format === 'song2html') {
    const parsed = parseSong(source)
    return { detectedFormat: 'song2html', confidence: 0.99, song: parsed.song, song2htmlSource: serializeSong(parsed.song), diagnostics: parsed.diagnostics, candidates: detected }
  }
  throw new Error(`Unsupported import format: ${format}`)
}
