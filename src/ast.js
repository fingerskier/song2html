import { formatChord, formatKey, parseChord, parseKey, transposeChord, transposeKey } from './theory.js'

export { formatChord, formatKey, parseChord, parseKey } from './theory.js'

/** Resource limits shared by every entry point (parser, AST builder, importers). */
export const LIMITS = Object.freeze({
  sourceLength: 1_000_000,
  lines: 20_000,
  repeat: 128,
  expandedChords: 10_000,
  sections: 1_000,
  arrangementEntries: 5_000,
})

export const METADATA_KEYS = Object.freeze(['key', 'tempo', 'author', 'time', 'owner', 'license', 'capo'])

// Names that collide with JavaScript object internals. They are ignored (with a
// warning) so that consumers keying plain objects by name stay safe.
const RESERVED_NAMES = new Set(['__proto__', 'prototype', ...Object.getOwnPropertyNames(Object.prototype)].map((name) => name.toLowerCase()))
export const isReservedName = (name) => RESERVED_NAMES.has(String(name).trim().toLowerCase())

const location = (line, column = 1, length = 1) => ({ line, column, length })
const codeType = (code) => code.toLowerCase().replaceAll('_', '-')

/** Builds a diagnostic. `details` may carry location, nodeId, and section. */
export function diagnostic(severity, code, message, details = {}) {
  const { location: loc, nodeId, section } = details
  return {
    severity, code, type: codeType(code), message,
    ...(loc ? { location: loc, line: loc.line } : {}),
    ...(section !== undefined ? { section } : {}),
    ...(nodeId ? { nodeId } : {}),
  }
}

const slug = (value, fallback = 'node') => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || fallback
export const sectionType = (name) => String(name).trim().split(/\s+/)[0].toLowerCase()
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)))

export function assertSourceLimits(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  if (source.length > LIMITS.sourceLength) throw new RangeError(`source exceeds ${LIMITS.sourceLength} characters`)
}

export function splitLines(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > LIMITS.lines) throw new RangeError(`source exceeds ${LIMITS.lines} lines`)
  return lines
}

/** Expands chord-definition lines (chords and repeat groups) into the played progression. */
export function expandChordLines(lines) {
  const progression = []
  for (const line of lines) {
    for (const item of line) {
      if (item.type === 'repeat') for (let count = 0; count < item.times; count++) progression.push(...item.chords)
      else progression.push(item)
    }
  }
  return progression
}

/**
 * Tokenizes one line of a chord progression ("(1 4) x2 5 6m") into chord and
 * repeat-group items. `budget.count` tracks expanded chords across a definition.
 */
export function tokenizeProgression(expression, { line = null, column = 1, diagnostics = [], budget = { count: 0 } } = {}) {
  const items = []
  const at = (offset, length) => (line == null ? undefined : location(line, column + offset, length))
  const chordAt = (token, offset) => {
    if (/^[0-9](?:\/[0-9])?/.test(token) && !/^[1-7](?:\/[1-7])?/.test(token)) {
      diagnostics.push(diagnostic('error', 'INVALID_DEGREE', `Nashville scale degrees must be between 1 and 7: "${token}"`, { location: at(offset, token.length) }))
    }
    return parseChord(token, at(offset, token.length))
  }
  const spend = (amount) => {
    budget.count += amount
    if (budget.count > LIMITS.expandedChords) throw new RangeError(`progression exceeds ${LIMITS.expandedChords} expanded chords`)
  }
  const matcher = /\(([^()]*)\)\s*(?:x\s*(\d+))?|(\S+)/gi
  let match
  while ((match = matcher.exec(expression))) {
    if (match[1] !== undefined) {
      const chords = [...match[1].matchAll(/\S+/g)].map((part) => chordAt(part[0], match.index + 1 + part.index))
      const times = match[2] ? Number(match[2]) : 1
      if (times < 1 || times > LIMITS.repeat) {
        diagnostics.push(diagnostic('error', 'INVALID_REPEAT', `Repeat multiplier x${times} must be between 1 and ${LIMITS.repeat}`, { location: at(match.index, match[0].length) }))
        continue
      }
      spend(chords.length * times)
      items.push({ type: 'repeat', chords, times })
    } else if (!/^x\d+$/i.test(match[3])) {
      spend(1)
      items.push(chordAt(match[3], match.index))
    }
  }
  if (/[()]/.test(expression.replace(/\([^()]*\)/g, ''))) {
    diagnostics.push(diagnostic('error', 'MALFORMED_REPEAT', `Malformed repetition expression: "${expression}"`, { location: at(0, expression.length) }))
  }
  return items
}

function lyricLineFromSource(text, startIndex = 0, loc) {
  const parts = []
  let cursor = 0
  let chordIndex = startIndex
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '^') continue
    if (index > cursor) parts.push({ type: 'lyric', text: text.slice(cursor, index) })
    parts.push({ type: 'chordEvent', progressionIndex: chordIndex++, ...(loc ? { location: location(loc.line, loc.column + index, 1) } : {}) })
    cursor = index + 1
  }
  if (cursor < text.length) parts.push({ type: 'lyric', text: text.slice(cursor) })
  return { type: 'lyricLine', parts, ...(loc ? { location: loc } : {}) }
}

const lyricLineToSource = (line) => line.parts.map((part) => (part.type === 'chordEvent' ? '^' : part.text)).join('')
const chordEventCount = (section) => section.lines.reduce((count, line) => count + line.parts.filter((part) => part.type === 'chordEvent').length, 0)

/** Default arrangement: every section in order; duplicate names resolve to their first definition. */
export function defaultArrangement(sections) {
  const firstByName = new Map()
  for (const section of sections) if (!firstByName.has(section.name)) firstByName.set(section.name, section.id)
  return { id: 'arrangement-default-1', name: 'default', entries: sections.map((section) => ({ sectionId: firstByName.get(section.name), transpose: null })) }
}

function parseTempo(value) {
  const match = value.match(/^(\d{1,3})(?:\s*bpm)?$/i)
  return match ? Number(match[1]) : null
}

function parseCapo(value) {
  const number = /^\d{1,2}$/.test(String(value).trim()) ? Number(value) : NaN
  return number >= 0 && number <= 11 ? number : null
}

/**
 * Parses song2html source into the canonical Song AST. This is the only parser;
 * `songToHtml()` and every MCP tool render from its output.
 * @returns {{ song: object, diagnostics: object[] }}
 */
export function parseSong(source) {
  assertSourceLimits(source)
  const lines = splitLines(source)
  const diagnostics = []
  const report = (severity, code, message, details) => diagnostics.push(diagnostic(severity, code, message, details))
  const lineAt = (index) => location(index + 1, 1, lines[index].length)

  // Title line and key ------------------------------------------------------
  const titleLine = (lines[0] ?? '').trim()
  const titleKey = titleLine.match(/\[([^\]]+)]$/)
  const metadata = {
    title: titleKey ? titleLine.slice(0, titleKey.index).trim() : titleLine,
    key: titleKey ? parseKey(titleKey[1]) : null,
    tempo: null, timeSignature: null, authors: [], owner: null, license: null, capo: null,
  }
  if (titleKey && !metadata.key) report('error', 'INVALID_KEY', `Invalid musical key: "${titleKey[1]}"`, { location: location(1, titleKey.index + 2, titleKey[1].length) })

  // Metadata and chord definitions -------------------------------------------
  const chordDefinitions = []
  const definitionsByName = new Map()
  let index = 1
  while (index < lines.length && !/^\s*Sections:/i.test(lines[index])) {
    const line = lines[index]
    const meta = line.match(/^\s*(key|tempo|author|time|owner|license|capo):\s*(.+)$/i)
    if (meta) {
      const name = meta[1].toLowerCase()
      const value = meta[2].trim()
      const valueAt = location(index + 1, line.indexOf(value) + 1, value.length)
      if (name === 'key') {
        metadata.key = parseKey(value)
        if (!metadata.key) report('error', 'INVALID_KEY', `Invalid musical key: "${value}"`, { location: valueAt })
      } else if (name === 'tempo') {
        metadata.tempo = parseTempo(value)
        if (metadata.tempo == null) report('error', 'INVALID_TEMPO', `Invalid tempo value: "${value}"`, { location: valueAt })
      } else if (name === 'capo') {
        metadata.capo = parseCapo(value)
        if (metadata.capo == null) report('error', 'INVALID_CAPO', `Invalid capo value: "${value}" (expected 0-11)`, { location: valueAt })
      } else if (name === 'author') metadata.authors = value.split(',').map((author) => author.trim()).filter(Boolean)
      else if (name === 'time') metadata.timeSignature = value
      else metadata[name] = value
      index++
      continue
    }
    const definition = line.match(/^\s*([^:\r\n]+):\s*(.+)$/u)
    if (definition) {
      const name = definition[1].trim()
      const startLine = index + 1
      const valueColumn = line.indexOf(':') + 1 + line.slice(line.indexOf(':') + 1).search(/\S/) + 1
      const display = [{ text: definition[2].trim(), line: startLine, column: valueColumn }]
      while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1]) && !/^[^:\r\n]+:\s*/u.test(lines[index + 1].trim())) {
        index++
        display.push({ text: lines[index].trim(), line: index + 1, column: lines[index].indexOf(lines[index].trim()) + 1 })
      }
      if (isReservedName(name)) {
        report('warning', 'RESERVED_NAME', `Chord definition name "${name}" is reserved and was ignored`, { location: location(startLine, 1, lines[startLine - 1].length) })
      } else {
        const budget = { count: 0 }
        const chordLines = display.map((entry) => tokenizeProgression(entry.text, { line: entry.line, column: entry.column, diagnostics, budget }))
        const node = {
          id: `chords-${slug(name)}-${chordDefinitions.length + 1}`, name, lines: chordLines,
          progression: expandChordLines(chordLines), location: location(startLine, 1, lines[startLine - 1].length),
        }
        const lookup = name.toLowerCase()
        if (definitionsByName.has(lookup)) report('warning', 'DUPLICATE_CHORD_DEFINITION', `Chord definition "${name}" is defined more than once; the last definition is used`, { location: node.location })
        definitionsByName.set(lookup, node)
        chordDefinitions.push(node)
      }
    } else if (line.trim()) {
      report('warning', 'UNRECOGNIZED_LINE', `Unrecognized metadata or chord line: "${line.trim()}"`, { location: lineAt(index) })
    }
    index++
  }

  // Sections -------------------------------------------------------------------
  const sections = []
  if (index >= lines.length) report('error', 'MISSING_SECTIONS', 'Required Sections: header is missing')
  else index++
  const sectionHeader = /^\s{2,}([^:\r\n]+):\s*$/u
  const firstSectionByName = new Map()
  while (index < lines.length && !/^\s*Arrangements:/i.test(lines[index])) {
    const header = lines[index].match(sectionHeader)
    if (!header) { index++; continue }
    const name = header[1].trim()
    const headerIndent = lines[index].match(/^\s*/)[0].length
    // Lines indented deeper than the header are content, even when they end in a colon.
    const startsSection = (line) => sectionHeader.test(line) && line.match(/^\s*/)[0].length <= headerIndent
    const headerAt = lineAt(index)
    const reserved = isReservedName(name)
    if (!reserved && sections.length >= LIMITS.sections) throw new RangeError(`song exceeds ${LIMITS.sections} sections`)
    const section = { id: `section-${slug(name)}-${sections.length + 1}`, name, chordDefinitionId: null, transpose: 0, lines: [], location: headerAt }
    let explicitChords
    let events = 0
    index++
    const endsSections = (line) => /^\s*Arrangements:/i.test(line) && line.match(/^\s*/)[0].length <= headerIndent
    while (index < lines.length && !startsSection(lines[index]) && !endsSections(lines[index])) {
      const value = lines[index].replace(/^\s{4}/, '')
      const directive = value.trim()
      const transpose = directive.match(/^<transpose\s*([+-]?\d+)>$/i)
      const chords = directive.match(/^<chords\s+([^>]+)>$/i)
      if (transpose) section.transpose = Number(transpose[1])
      else if (chords) explicitChords = chords[1].trim()
      else if (directive) {
        const lyricLine = lyricLineFromSource(value, events, location(index + 1, lines[index].length - value.length + 1, value.length))
        events += lyricLine.parts.filter((part) => part.type === 'chordEvent').length
        section.lines.push(lyricLine)
      }
      index++
    }
    if (reserved) {
      report('warning', 'RESERVED_NAME', `Section name "${name}" is reserved and was ignored`, { location: headerAt, section: name })
      continue
    }
    if (explicitChords !== undefined) {
      if (explicitChords.toLowerCase() === 'none') section.chordDefinitionId = null
      else if (definitionsByName.has(explicitChords.toLowerCase())) section.chordDefinitionId = definitionsByName.get(explicitChords.toLowerCase()).id
      else report('error', 'UNKNOWN_CHORD_DEFINITION', `Section "${name}" references unknown chord definition "${explicitChords}"`, { location: headerAt, section: name, nodeId: section.id })
    } else {
      section.chordDefinitionId = definitionsByName.get(sectionType(name))?.id || null
    }
    if (firstSectionByName.has(name)) {
      report('error', 'DUPLICATE_SECTION', `Section "${name}" is defined more than once; the first definition is retained`, { location: headerAt, section: name, nodeId: section.id })
    } else firstSectionByName.set(name, section)
    sections.push(section)
  }

  // Arrangements -----------------------------------------------------------------
  const arrangements = []
  if (index < lines.length && /^\s*Arrangements:/i.test(lines[index])) {
    index++
    const arrangementNames = new Set()
    while (index < lines.length) {
      const header = lines[index].match(/^(\s{2,})([^:\r\n]+?)\s*(:?)\s*$/u)
      if (!header) { index++; continue }
      const indent = header[1].length
      let look = index + 1
      while (look < lines.length && !lines[look].trim()) look++
      const nextIndent = look < lines.length ? lines[look].match(/^\s*/)[0].length : 0
      if (!header[3] && nextIndent <= indent) { index++; continue }
      const name = header[2].trim()
      const headerAt = lineAt(index)
      const id = `arrangement-${slug(name)}-${arrangements.length + 1}`
      const entries = []
      const reported = new Set()
      index++
      while (index < lines.length && (!lines[index].trim() || lines[index].match(/^\s*/)[0].length > indent)) {
        const raw = lines[index].trim()
        if (raw && !/^<transpose\s*[+-]?\d+>$/i.test(raw)) {
          if (entries.length >= LIMITS.arrangementEntries) throw new RangeError(`arrangement exceeds ${LIMITS.arrangementEntries} entries`)
          const transpose = raw.match(/<transpose\s*([+-]?\d+)>/i)
          const sectionName = raw.replace(/\s*<transpose\s*[+-]?\d+>\s*/i, ' ').trim()
          const target = firstSectionByName.get(sectionName)
          const entryAt = lineAt(index)
          if (!target && !reported.has(sectionName)) {
            reported.add(sectionName)
            report('error', 'MISSING_SECTION', `Section "${sectionName}" referenced in arrangement "${name}" but not defined in Sections`, { location: entryAt, section: sectionName, nodeId: id })
          }
          if (target && sections.filter((section) => section.name === sectionName).length > 1 && !reported.has(sectionName)) {
            reported.add(sectionName)
            report('warning', 'AMBIGUOUS_SECTION_REFERENCE', `Arrangement reference "${sectionName}" matches multiple sections; the first is used`, { location: entryAt, section: sectionName, nodeId: id })
          }
          entries.push({ sectionId: target?.id ?? null, name: sectionName, transpose: transpose ? Number(transpose[1]) : null, location: entryAt })
        }
        index++
      }
      if (isReservedName(name)) {
        report('warning', 'RESERVED_NAME', `Arrangement name "${name}" is reserved and was ignored`, { location: headerAt })
      } else if (arrangementNames.has(name)) {
        report('warning', 'DUPLICATE_ARRANGEMENT', `Arrangement "${name}" is defined more than once; the first definition is retained`, { location: headerAt, nodeId: id })
      } else {
        arrangementNames.add(name)
        arrangements.push({ id, name, entries, location: headerAt })
      }
    }
  }
  if (!arrangements.length) arrangements.push(defaultArrangement(sections))

  const song = { type: 'song', version: 2, metadata, chordDefinitions, sections, arrangements, provenance: { format: 'song2html' } }
  diagnostics.push(...validateSong(song))
  return { song, diagnostics: deduplicateDiagnostics(diagnostics) }
}

function deduplicateDiagnostics(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.code}:${item.message}:${item.location?.line || ''}:${item.location?.column || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const UNSAFE_NAME = /[:\r\n]/

/** Structural validation shared by parsed, created, and imported songs. */
export function validateSong(song) {
  const diagnostics = []
  const report = (severity, code, message, details) => diagnostics.push(diagnostic(severity, code, message, details))
  if (!song?.metadata?.title) report('error', 'MISSING_TITLE', 'Song title is required')
  if (!song?.metadata?.key) report('warning', 'MISSING_KEY', 'No musical key specified in title or metadata')
  const definitions = new Map(song.chordDefinitions.map((entry) => [entry.id, entry]))
  const sectionIds = new Set(song.sections.map((entry) => entry.id))
  const nodeIds = new Set()
  for (const node of [...song.chordDefinitions, ...song.sections, ...song.arrangements]) {
    if (nodeIds.has(node.id)) report('error', 'DUPLICATE_NODE_ID', `Duplicate node id "${node.id}"`, { location: node.location, nodeId: node.id })
    nodeIds.add(node.id)
    if (!String(node.name ?? '').trim() || UNSAFE_NAME.test(node.name)) report('error', 'INVALID_NAME', `Name ${JSON.stringify(node.name)} cannot be written as song2html source`, { location: node.location, nodeId: node.id })
    else if (isReservedName(node.name)) report('warning', 'RESERVED_NAME', `Name "${node.name}" is reserved and will be ignored when parsed`, { location: node.location, nodeId: node.id })
  }
  for (const definition of song.chordDefinitions) {
    for (const chord of definition.progression) if (chord.notation === 'unknown') report('warning', 'UNKNOWN_CHORD', `Unrecognized chord token "${chord.raw}"`, { location: chord.location, nodeId: definition.id })
  }
  const missingChordTypes = new Set()
  for (const section of song.sections) {
    const events = chordEventCount(section)
    const definition = section.chordDefinitionId ? definitions.get(section.chordDefinitionId) : null
    if (section.chordDefinitionId && !definition) report('error', 'UNKNOWN_CHORD_DEFINITION', `Section "${section.name}" references an unknown chord definition`, { location: section.location, section: section.name, nodeId: section.id })
    if (!section.lines.length) report('warning', 'EMPTY_SECTION', `Section "${section.name}" is empty`, { location: section.location, section: section.name, nodeId: section.id })
    if (events && !section.chordDefinitionId && !missingChordTypes.has(sectionType(section.name))) {
      missingChordTypes.add(sectionType(section.name))
      report('warning', 'MISSING_CHORDS', `No chord definition found for section type "${sectionType(section.name)}"`, { location: section.location, section: section.name, nodeId: section.id })
    }
    const chordCount = definition?.progression.length || 0
    if (events && chordCount && events > chordCount) {
      report('warning', 'CHORD_CARET_MISMATCH', `Section "${section.name}" has ${events} chord markers but only ${chordCount} chords defined (chords will cycle)`, { location: section.location, section: section.name, nodeId: section.id })
    }
  }
  for (const arrangement of song.arrangements) {
    if (!arrangement.entries.length) report('warning', 'EMPTY_ARRANGEMENT', `Arrangement "${arrangement.name}" is empty`, { location: arrangement.location, nodeId: arrangement.id })
    for (const entry of arrangement.entries) {
      if (entry.sectionId == null || sectionIds.has(entry.sectionId)) continue
      report('error', 'MISSING_SECTION', `Arrangement "${arrangement.name}" references unknown section id "${entry.sectionId}"`, { location: entry.location, nodeId: arrangement.id })
    }
  }
  return diagnostics
}

function chordLinesFromInput(value) {
  if (Array.isArray(value)) {
    const chords = value.filter(Boolean).map((chord) => (typeof chord === 'string' ? parseChord(chord) : chord))
    return [chords]
  }
  const budget = { count: 0 }
  return String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => tokenizeProgression(line, { budget }))
}

/**
 * Builds a Song AST from plain structured input (MCP create_song, importers).
 * Sections link to chord definitions by `section.chords` (definition name, or null
 * for none) and otherwise by the first word of the section name.
 */
export function createSongAst(input = {}) {
  const key = typeof input.key === 'string' ? parseKey(input.key) : input.key || null
  const chordDefinitions = Object.entries(input.chords || {}).map(([name, value], index) => {
    const lines = chordLinesFromInput(value)
    return { id: `chords-${slug(name)}-${index + 1}`, name, lines, progression: expandChordLines(lines) }
  })
  if (chordDefinitions.some((definition) => definition.progression.length > LIMITS.expandedChords)) {
    throw new RangeError(`progression exceeds ${LIMITS.expandedChords} expanded chords`)
  }
  const definitions = new Map(chordDefinitions.map((entry) => [entry.name.toLowerCase(), entry.id]))
  const inputSections = input.sections || []
  if (inputSections.length > LIMITS.sections) throw new RangeError(`song exceeds ${LIMITS.sections} sections`)
  const sections = inputSections.map((section, index) => {
    const id = section.id || `section-${slug(section.name)}-${index + 1}`
    let chordDefinitionId = section.chordDefinitionId ?? null
    if (!chordDefinitionId) {
      if (section.chords === null) chordDefinitionId = null
      else if (typeof section.chords === 'string') chordDefinitionId = definitions.get(section.chords.toLowerCase()) || null
      else chordDefinitionId = definitions.get(sectionType(section.name)) || null
    }
    let events = 0
    const lines = (section.lines || section.lyrics || []).map((line) => {
      if (typeof line !== 'string') return line
      const parsed = lyricLineFromSource(line, events)
      events += parsed.parts.filter((part) => part.type === 'chordEvent').length
      return parsed
    })
    return { id, name: section.name, chordDefinitionId, transpose: section.transpose || 0, lines }
  })
  const byName = new Map()
  for (const section of sections) if (!byName.has(section.name)) byName.set(section.name, section.id)
  const arrangements = input.arrangements && Object.keys(input.arrangements).length
    ? Object.entries(input.arrangements).map(([name, entries], index) => ({
      id: `arrangement-${slug(name)}-${index + 1}`, name,
      entries: entries.map((entry) => {
        if (typeof entry !== 'string') return entry
        const transpose = entry.match(/<transpose\s*([+-]?\d+)>/i)
        const sectionName = entry.replace(/\s*<transpose\s*[+-]?\d+>\s*/i, ' ').trim()
        return { sectionId: byName.get(sectionName) ?? null, name: sectionName, transpose: transpose ? Number(transpose[1]) : null }
      }),
    }))
    : [defaultArrangement(sections)]
  return {
    type: 'song', version: 2,
    metadata: {
      title: input.title || '', key, tempo: input.tempo ?? null,
      timeSignature: input.timeSignature || input.time || null,
      authors: input.authors || (input.author ? String(input.author).split(',').map((name) => name.trim()).filter(Boolean) : []),
      owner: input.owner || null, license: input.license || null, capo: input.capo ?? null,
    },
    chordDefinitions, sections, arrangements, provenance: input.provenance || null,
  }
}

const formatTranspose = (value) => `<transpose ${value > 0 ? '+' : ''}${value}>`
const formatChordLine = (line) => line.map((item) => (item.type === 'repeat' ? `(${item.chords.map(formatChord).join(' ')})${item.times > 1 ? ` x${item.times}` : ''}` : formatChord(item))).join(' ')

function isImplicitDefault(song) {
  if (song.arrangements.length !== 1 || song.arrangements[0].name !== 'default') return false
  const expected = defaultArrangement(song.sections).entries
  const { entries } = song.arrangements[0]
  return entries.length === expected.length && entries.every((entry, index) => entry.sectionId === expected[index].sectionId && !entry.transpose)
}

/** Serializes a Song AST to canonical song2html source. */
export function serializeSong(song) {
  const lines = []
  const { metadata } = song
  const key = formatKey(metadata.key)
  lines.push(`${metadata.title}${key ? ` [${key}]` : ''}`)
  if (metadata.authors?.length) lines.push(`  author: ${metadata.authors.join(', ')}`)
  if (metadata.tempo != null) lines.push(`  tempo: ${metadata.tempo}`)
  if (metadata.timeSignature) lines.push(`  time: ${metadata.timeSignature}`)
  if (metadata.capo != null) lines.push(`  capo: ${metadata.capo}`)
  if (metadata.owner) lines.push(`  owner: ${metadata.owner}`)
  if (metadata.license) lines.push(`  license: ${metadata.license}`)
  const definitions = new Map(song.chordDefinitions.map((definition) => [definition.id, definition]))
  const definitionNames = new Set(song.chordDefinitions.map((definition) => definition.name.toLowerCase()))
  for (const definition of song.chordDefinitions) {
    const chordLines = definition.lines?.length ? definition.lines : [definition.progression]
    const [first, ...rest] = chordLines.map(formatChordLine)
    lines.push(`  ${definition.name}: ${first ?? ''}`)
    for (const line of rest) lines.push(`    ${line}`)
  }
  lines.push('', 'Sections:')
  for (const section of song.sections) {
    lines.push(`  ${section.name}:`)
    const linked = definitions.get(section.chordDefinitionId)
    if (linked && linked.name.toLowerCase() !== sectionType(section.name)) lines.push(`    <chords ${linked.name}>`)
    if (!linked && definitionNames.has(sectionType(section.name))) lines.push('    <chords none>')
    if (section.transpose) lines.push(`    ${formatTranspose(section.transpose)}`)
    for (const line of section.lines) lines.push(`    ${lyricLineToSource(line)}`)
    lines.push('')
  }
  if (!isImplicitDefault(song)) {
    const sections = new Map(song.sections.map((section) => [section.id, section]))
    lines.push('Arrangements:')
    for (const arrangement of song.arrangements) {
      lines.push(`  ${arrangement.name}:`)
      for (const entry of arrangement.entries) {
        const name = sections.get(entry.sectionId)?.name || entry.name || entry.sectionId || ''
        lines.push(`    ${name}${entry.transpose != null ? ` ${formatTranspose(entry.transpose)}` : ''}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}

/**
 * Transposes a song by semitones: the key, and every named chord root, bass, treble,
 * and melody note. Nashville degrees are unchanged and follow the new key.
 */
export function transposeSongAst(song, steps) {
  if (!Number.isInteger(steps)) throw new TypeError('steps must be an integer number of half steps')
  const copy = clone(song)
  const fromKey = copy.metadata.key
  const toKey = transposeKey(fromKey, steps)
  copy.metadata.key = toKey
  const move = (chord) => transposeChord(chord, steps, fromKey, toKey)
  for (const definition of copy.chordDefinitions) {
    definition.lines = (definition.lines?.length ? definition.lines : [definition.progression]).map((line) => line.map((item) => (item.type === 'repeat' ? { ...item, chords: item.chords.map(move) } : move(item))))
    definition.progression = expandChordLines(definition.lines)
  }
  return copy
}

/** Removes source locations, spelling, and provenance so ASTs can be compared semantically. */
export function semanticSong(song) {
  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['location', 'raw', 'provenance'].includes(key)).map(([key, item]) => [key, strip(item)]))
    return value
  }
  return strip(clone(song))
}
