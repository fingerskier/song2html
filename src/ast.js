const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'])

const location = (line, column = 1, length = 1) => ({ line, column, length })
const diagnostic = (severity, code, message, loc, nodeId) => ({ severity, code, type: code.toLowerCase().replaceAll('_', '-'), message, ...(loc ? { location: loc, line: loc.line } : {}), ...(nodeId ? { nodeId } : {}) })
const slug = (value, fallback = 'node') => value.normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || fallback

export function parseKey(value) {
  if (!value) return null
  const normalized = String(value).replaceAll('♯', '#').replaceAll('♭', 'b')
  const match = normalized.match(/^([A-Ga-g])([#b]?)(m?)$/)
  if (!match) return null
  return { tonic: match[1].toUpperCase() + match[2], mode: match[3] ? 'minor' : 'major' }
}

export function formatKey(key) {
  return key ? `${key.tonic}${key.mode === 'minor' ? 'm' : ''}` : ''
}

function semitone(note) {
  const upper = note.toUpperCase()
  const direct = CHROMATIC.indexOf(upper)
  if (direct >= 0) return direct
  return CHROMATIC.indexOf({ DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' }[upper])
}

function transposeNote(note, steps, useFlats) {
  const index = semitone(note)
  if (index < 0) return note
  const shifted = CHROMATIC[(index + (steps % 12) + 12) % 12]
  return useFlats ? (FLATS[shifted] || shifted) : shifted
}

export function parseChord(token, loc) {
  if (/^N\.?C\.?$/i.test(String(token).trim())) {
    return { type: 'chord', notation: 'rest', raw: token, location: loc }
  }
  const positionMatch = token.match(/\|(\d{1,2})$/)
  const position = positionMatch ? Number(positionMatch[1]) : null
  const base = positionMatch ? token.slice(0, -positionMatch[0].length) : token
  const nashville = base.match(/^([1-7])(?:\/([1-7]))?([^\s]*)$/)
  if (nashville) {
    return {
      type: 'chord', notation: 'nashville', degree: Number(nashville[1]),
      quality: nashville[3] || '', bass: nashville[2] ? { type: 'scaleDegree', degree: Number(nashville[2]) } : null,
      position, raw: token, location: loc,
    }
  }
  const named = base.match(/^([A-Ga-g][#♯b♭]?)((?:(?:maj|min|dim|aug|sus|add|no|m)?(?:\d|[#b+()])*)?)(?:\/([A-Ga-g][#♯b♭]?))?((?:\\[A-Ga-g0-9#♯b♭]+|-[A-Ga-g0-9#♯b♭]+)?)$/)
  if (named) {
    return {
      type: 'chord', notation: 'named', root: named[1][0].toUpperCase() + named[1].slice(1).replaceAll('♯', '#').replaceAll('♭', 'b'),
      quality: named[2] || '', bass: named[3] ? { type: 'note', note: named[3][0].toUpperCase() + named[3].slice(1).replaceAll('♯', '#').replaceAll('♭', 'b') } : null,
      suffix: named[4] || '', position, raw: token, location: loc,
    }
  }
  return { type: 'chord', notation: 'unknown', raw: token, location: loc }
}

export function formatChord(chord) {
  if (chord.notation === 'rest') return chord.raw || 'N.C.'
  if (chord.notation === 'nashville') {
    return `${chord.degree}${chord.bass ? `/${chord.bass.degree}` : ''}${chord.quality || ''}${chord.position == null ? '' : `|${chord.position}`}`
  }
  if (chord.notation === 'named') {
    return `${chord.root}${chord.quality || ''}${chord.bass ? `/${chord.bass.note}` : ''}${chord.suffix || ''}${chord.position == null ? '' : `|${chord.position}`}`
  }
  return chord.raw
}

function expandProgression(expression, line, diagnostics) {
  const tokens = []
  const matcher = /\(([^()]*)\)\s*(?:x\s*(\d+))?|(\S+)/gi
  let match
  while ((match = matcher.exec(expression))) {
    if (match[1] !== undefined) {
      const group = match[1].trim().split(/\s+/).filter(Boolean)
      const repeat = match[2] ? Number(match[2]) : 1
      if (repeat < 1 || repeat > 128) {
        diagnostics.push(diagnostic('error', 'INVALID_REPEAT', `Repeat x${repeat} must be between 1 and 128`, location(line, match.index + 1, match[0].length)))
        continue
      }
      for (let count = 0; count < repeat; count++) tokens.push(...group)
    } else if (!/^x\d+$/i.test(match[3])) tokens.push(match[3])
  }
  return tokens.map((token) => parseChord(token, location(line, Math.max(1, expression.indexOf(token) + 1), token.length)))
}

export function createSongAst(input = {}) {
  const key = typeof input.key === 'string' ? parseKey(input.key) : input.key || null
  const chordDefinitions = Object.entries(input.chords || {}).map(([name, progression], index) => ({
    id: `chords-${slug(name)}-${index + 1}`, name,
    progression: (Array.isArray(progression) ? progression : String(progression).split(/\s+/)).filter(Boolean).map((value) => typeof value === 'string' ? parseChord(value) : value),
  }))
  const definitions = new Map(chordDefinitions.map((entry) => [entry.name.toLowerCase(), entry.id]))
  const sections = (input.sections || []).map((section, index) => {
    const id = section.id || `section-${slug(section.name)}-${index + 1}`
    const definitionId = definitions.get(section.name.split(/\s+/)[0].toLowerCase()) || null
    return {
      id, name: section.name, chordDefinitionId: section.chordDefinitionId || definitionId, transpose: section.transpose || 0,
      lines: (section.lines || section.lyrics || []).map((line) => typeof line === 'string' ? lyricLineFromSource(line) : line),
    }
  })
  const byName = new Map(sections.map((section) => [section.name, section.id]))
  const arrangements = input.arrangements
    ? Object.entries(input.arrangements).map(([name, entries], index) => ({ id: `arrangement-${slug(name)}-${index + 1}`, name, entries: entries.map((entry) => typeof entry === 'string' ? { sectionId: byName.get(entry.replace(/\s*<transpose.*$/i, '')) || entry, transpose: Number(entry.match(/<transpose\s*([+-]?\d+)>/i)?.[1] || 0) } : entry) }))
    : [{ id: 'arrangement-default-1', name: 'default', entries: sections.map((section) => ({ sectionId: section.id, transpose: 0 })) }]
  return {
    type: 'song', version: 1,
    metadata: { title: input.title || '', key, tempo: input.tempo ?? null, timeSignature: input.timeSignature || input.time || null, authors: input.authors || (input.author ? String(input.author).split(',').map((name) => name.trim()).filter(Boolean) : []), owner: input.owner || null, license: input.license || null },
    chordDefinitions, sections, arrangements, provenance: input.provenance || null,
  }
}

function lyricLineFromSource(text, loc) {
  const parts = []
  let cursor = 0
  let chordIndex = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '^') continue
    if (index > cursor) parts.push({ type: 'lyric', text: text.slice(cursor, index) })
    parts.push({ type: 'chordEvent', progressionIndex: chordIndex++, location: loc ? location(loc.line, loc.column + index, 1) : undefined })
    cursor = index + 1
  }
  if (cursor < text.length) parts.push({ type: 'lyric', text: text.slice(cursor) })
  return { type: 'lyricLine', parts, location: loc }
}

function lyricLineToSource(line) {
  return line.parts.map((part) => part.type === 'chordEvent' ? '^' : part.text).join('')
}

export function parseSong(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  if (source.length > 1_000_000) throw new RangeError('source exceeds 1000000 characters')
  const diagnostics = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 20_000) throw new RangeError('source exceeds 20000 lines')
  const titleLine = (lines[0] || '').trim()
  const titleKey = titleLine.match(/\[([^\]]+)]$/)
  const key = titleKey ? parseKey(titleKey[1]) : null
  if (titleKey && !key) diagnostics.push(diagnostic('error', 'INVALID_KEY', `Invalid key "${titleKey[1]}"`, location(1, titleKey.index + 2, titleKey[1].length)))
  const metadata = { title: titleKey ? titleLine.slice(0, titleKey.index).trim() : titleLine, key, tempo: null, timeSignature: null, authors: [], owner: null, license: null }
  const chordDefinitions = []
  const sections = []
  const arrangements = []
  let index = 1
  while (index < lines.length && !/^\s*Sections:/i.test(lines[index])) {
    const meta = lines[index].match(/^\s*(key|tempo|author|time|owner|license):\s*(.*)$/i)
    if (meta) {
      const name = meta[1].toLowerCase(); const value = meta[2].trim()
      if (name === 'key') {
        metadata.key = parseKey(value)
        if (!metadata.key) diagnostics.push(diagnostic('error', 'INVALID_KEY', `Invalid key "${value}"`, location(index + 1, lines[index].indexOf(value) + 1, value.length)))
      } else if (name === 'tempo') {
        metadata.tempo = /^\d+$/.test(value) ? Number(value) : null
        if (metadata.tempo == null) diagnostics.push(diagnostic('error', 'INVALID_TEMPO', `Invalid tempo "${value}"`, location(index + 1, lines[index].indexOf(value) + 1, value.length)))
      } else if (name === 'author') metadata.authors = value.split(',').map((author) => author.trim()).filter(Boolean)
      else if (name === 'time') metadata.timeSignature = value || null
      else metadata[name] = value || null
      index++; continue
    }
    const definition = lines[index].match(/^\s*([^:\r\n]+):\s*(.+)$/u)
    if (definition) {
      const name = definition[1].trim(); const display = [definition[2].trim()]; const startLine = index + 1
      while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1]) && !/^[^:\r\n]+:\s*/u.test(lines[index + 1].trim())) display.push(lines[++index].trim())
      chordDefinitions.push({ id: `chords-${slug(name)}-${chordDefinitions.length + 1}`, name, progression: expandProgression(display.join(' '), startLine, diagnostics), display, location: location(startLine, 1, lines[startLine - 1].length) })
    } else if (lines[index].trim()) diagnostics.push(diagnostic('warning', 'UNRECOGNIZED_LINE', `Unrecognized line "${lines[index].trim()}"`, location(index + 1, 1, lines[index].length)))
    index++
  }
  if (index >= lines.length) diagnostics.push(diagnostic('error', 'MISSING_SECTIONS', 'Required Sections: header is missing'))
  else index++
  const definitions = new Map(chordDefinitions.map((entry) => [entry.name.toLowerCase(), entry.id]))
  const sectionHeader = /^\s{2,}([^:\r\n]+):\s*$/u
  while (index < lines.length && !/^\s*Arrangements:/i.test(lines[index])) {
    const header = lines[index].match(sectionHeader)
    if (!header) { index++; continue }
    const name = header[1].trim(); const section = { id: `section-${slug(name)}-${sections.length + 1}`, name, chordDefinitionId: definitions.get(name.split(/\s+/)[0].toLowerCase()) || null, transpose: 0, lines: [], location: location(index + 1, 1, lines[index].length) }
    index++
    while (index < lines.length && !sectionHeader.test(lines[index]) && !/^\s*Arrangements:/i.test(lines[index])) {
      const value = lines[index].replace(/^\s{4}/, '')
      const transpose = value.trim().match(/^<transpose\s*([+-]?\d+)>$/i)
      if (transpose) section.transpose = Number(transpose[1])
      else if (value.trim()) section.lines.push(lyricLineFromSource(value, location(index + 1, 5, value.length)))
      index++
    }
    sections.push(section)
  }
  const byName = new Map()
  for (const section of sections) {
    if (!byName.has(section.name)) byName.set(section.name, [])
    byName.get(section.name).push(section)
  }
  if (index < lines.length && /^\s*Arrangements:/i.test(lines[index])) {
    index++
    const arrangementHeader = /^(\s{2,})([^:\r\n]+):\s*$/u
    while (index < lines.length) {
      const header = lines[index].match(arrangementHeader)
      if (!header) { index++; continue }
      const name = header[2].trim(); const indent = header[1].length; const entries = []; const id = `arrangement-${slug(name)}-${arrangements.length + 1}`
      index++
      while (index < lines.length && (/^(\s*)/.exec(lines[index])?.[1].length || 0) > indent) {
        const raw = lines[index].trim()
        if (raw) {
          const transpose = Number(raw.match(/<transpose\s*([+-]?\d+)>/i)?.[1] || 0)
          const sectionName = raw.replace(/\s*<transpose\s*[+-]?\d+>/i, '').trim()
          const matches = byName.get(sectionName) || []
          if (!matches.length) diagnostics.push(diagnostic('error', 'UNKNOWN_SECTION_REFERENCE', `Arrangement references unknown section "${sectionName}"`, location(index + 1, 1, lines[index].length), id))
          if (matches.length > 1) diagnostics.push(diagnostic('warning', 'AMBIGUOUS_SECTION_REFERENCE', `Arrangement reference "${sectionName}" matches multiple sections; the first is used`, location(index + 1, 1, lines[index].length), id))
          entries.push({ sectionId: matches[0]?.id || sectionName, transpose, location: location(index + 1, 1, lines[index].length) })
        }
        index++
      }
      arrangements.push({ id, name, entries })
    }
  }
  if (!arrangements.length) arrangements.push({ id: 'arrangement-default-1', name: 'default', entries: sections.map((section) => ({ sectionId: section.id, transpose: 0 })) })
  const song = { type: 'song', version: 1, metadata, chordDefinitions, sections, arrangements, provenance: { format: 'song2html' } }
  diagnostics.push(...validateSong(song))
  return { song, diagnostics: deduplicateDiagnostics(diagnostics) }
}

function deduplicateDiagnostics(items) {
  const seen = new Set()
  return items.filter((item) => { const key = `${item.code}:${item.message}:${item.location?.line || ''}:${item.location?.column || ''}`; if (seen.has(key)) return false; seen.add(key); return true })
}

export function validateSong(song) {
  const diagnostics = []
  if (!song?.metadata?.title) diagnostics.push(diagnostic('error', 'MISSING_TITLE', 'Song title is required'))
  if (!song?.metadata?.key) diagnostics.push(diagnostic('warning', 'MISSING_KEY', 'No musical key specified'))
  const definitionIds = new Set(song.chordDefinitions.map((entry) => entry.id))
  const sectionIds = new Set(song.sections.map((entry) => entry.id))
  const nodeIds = new Set()
  for (const node of [...song.chordDefinitions, ...song.sections, ...song.arrangements]) {
    if (nodeIds.has(node.id)) diagnostics.push(diagnostic('error', 'DUPLICATE_NODE_ID', `Duplicate node id "${node.id}"`, node.location, node.id))
    nodeIds.add(node.id)
  }
  for (const definition of song.chordDefinitions) {
    for (const chord of definition.progression) if (chord.notation === 'unknown') diagnostics.push(diagnostic('warning', 'UNKNOWN_CHORD', `Unrecognized chord token "${chord.raw}"`, chord.location, definition.id))
  }
  for (const section of song.sections) {
    if (section.chordDefinitionId && !definitionIds.has(section.chordDefinitionId)) diagnostics.push(diagnostic('error', 'UNKNOWN_CHORD_DEFINITION', `Section "${section.name}" references an unknown chord definition`, section.location, section.id))
    if (!section.lines.length) diagnostics.push(diagnostic('warning', 'EMPTY_SECTION', `Section "${section.name}" is empty`, section.location, section.id))
    const definition = song.chordDefinitions.find((entry) => entry.id === section.chordDefinitionId)
    const caretCount = section.lines.reduce((count, line) => count + line.parts.filter((part) => part.type === 'chordEvent').length, 0)
    const chordCount = definition?.progression.length || 0
    if (caretCount > 0 && chordCount > 0 && caretCount > chordCount) {
      diagnostics.push(diagnostic('warning', 'CHORD_CARET_MISMATCH', `Section "${section.name}" has ${caretCount} chord markers but only ${chordCount} chords defined (chords will cycle)`, section.location, section.id))
    }
  }
  for (const arrangement of song.arrangements) {
    if (!arrangement.entries.length) diagnostics.push(diagnostic('warning', 'EMPTY_ARRANGEMENT', `Arrangement "${arrangement.name}" is empty`, arrangement.location, arrangement.id))
    for (const entry of arrangement.entries) if (!sectionIds.has(entry.sectionId)) diagnostics.push(diagnostic('error', 'UNKNOWN_SECTION_REFERENCE', `Arrangement "${arrangement.name}" references unknown section id "${entry.sectionId}"`, entry.location, arrangement.id))
  }
  return diagnostics
}

export function serializeSong(song) {
  const lines = []
  const key = formatKey(song.metadata.key)
  lines.push(`${song.metadata.title}${key ? ` [${key}]` : ''}`)
  if (song.metadata.authors?.length) lines.push(`  author: ${song.metadata.authors.join(', ')}`)
  if (song.metadata.tempo != null) lines.push(`  tempo: ${song.metadata.tempo}`)
  if (song.metadata.timeSignature) lines.push(`  time: ${song.metadata.timeSignature}`)
  if (song.metadata.owner) lines.push(`  owner: ${song.metadata.owner}`)
  if (song.metadata.license) lines.push(`  license: ${song.metadata.license}`)
  for (const definition of song.chordDefinitions) lines.push(`  ${definition.name}: ${definition.progression.map(formatChord).join(' ')}`)
  lines.push('', 'Sections:')
  for (const section of song.sections) {
    lines.push(`  ${section.name}:`)
    if (section.transpose) lines.push(`    <transpose ${section.transpose > 0 ? '+' : ''}${section.transpose}>`)
    for (const line of section.lines) lines.push(`    ${lyricLineToSource(line)}`)
    lines.push('')
  }
  const isImplicitDefault = song.arrangements.length === 1 && song.arrangements[0].name === 'default' && song.arrangements[0].entries.every((entry, index) => entry.sectionId === song.sections[index]?.id && !entry.transpose)
  if (!isImplicitDefault) {
    const sections = new Map(song.sections.map((section) => [section.id, section]))
    lines.push('Arrangements:')
    for (const arrangement of song.arrangements) {
      lines.push(`  ${arrangement.name}:`)
      for (const entry of arrangement.entries) {
        const name = sections.get(entry.sectionId)?.name || entry.sectionId
        lines.push(`    ${name}${entry.transpose ? ` <transpose ${entry.transpose > 0 ? '+' : ''}${entry.transpose}>` : ''}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}

export function transposeSongAst(song, steps) {
  const copy = structuredClone(song)
  const originalKey = formatKey(copy.metadata.key)
  const useFlats = FLAT_KEYS.has(originalKey) || originalKey.includes('b')
  if (copy.metadata.key) copy.metadata.key.tonic = transposeNote(copy.metadata.key.tonic, steps, useFlats)
  for (const definition of copy.chordDefinitions) {
    for (const chord of definition.progression) {
      if (chord.notation !== 'named') continue
      chord.root = transposeNote(chord.root, steps, useFlats)
      if (chord.bass?.type === 'note') chord.bass.note = transposeNote(chord.bass.note, steps, useFlats)
      chord.raw = formatChord(chord)
    }
  }
  return copy
}

export function semanticSong(song) {
  const copy = structuredClone(song)
  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['location', 'raw', 'display', 'provenance'].includes(key)).map(([key, item]) => [key, strip(item)]))
    return value
  }
  return strip(copy)
}
