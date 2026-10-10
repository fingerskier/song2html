import { diagnostic } from './ast.js'
import { formatKey, resolveChord, transposeKey } from './theory.js'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ESCAPES[character])
const esc = escapeHtml

const slug = (value) => value.normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || 'section'

// Heuristic page weights so pagination can be tuned later:
// meta lines ~1 unit, chord/section headings ~2, chord paragraphs ~2, lyric lines ~1.
const PAGE_BUDGET = 28
const LINE_WEIGHTS = { metaLine: 1, chordsHeading: 2, chordParagraph: 2, sectionHeading: 2, lyricLine: 1 }

/** Normalizes a capo value (0-11) or returns null. */
export function normalizeCapo(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 11) throw new RangeError('capo must be an integer from 0 to 11')
  return number
}

/**
 * Renders a Song AST to the paginated HTML fragment.
 * @param {object} song - Song AST from parseSong(), createSongAst(), or an importer.
 * @param {{ arrangement?: string, capo?: number|null }} [options]
 *   capo: shows chord shapes for a capo on fret N (overrides the song's `capo:` metadata).
 * @returns {{ html: string, arrangements: string[], song: object, diagnostics: object[] }}
 */
export function renderSongHtml(song, options = {}) {
  const diagnostics = []
  const { metadata } = song
  const key = metadata.key || null
  const capo = normalizeCapo(options.capo ?? metadata.capo ?? null)
  const shapeKey = capo ? transposeKey(key, -capo) : key
  const definitions = new Map(song.chordDefinitions.map((definition) => [definition.id, definition]))
  const sections = new Map(song.sections.map((section) => [section.id, section]))

  const arrangementName = options.arrangement || ''
  let arrangement = song.arrangements.find((entry) => entry.name === arrangementName)
  if (arrangementName && !arrangement) {
    diagnostics.push(diagnostic('error', 'UNKNOWN_ARRANGEMENT', `Arrangement "${arrangementName}" does not exist`))
    arrangement = { entries: [] }
  }
  arrangement ??= song.arrangements[0] || { entries: [] }
  const entries = arrangement.entries.map((entry) => ({ entry, section: sections.get(entry.sectionId) })).filter((item) => item.section)

  // Arrangement-level transpose overrides section-level transpose (not additive).
  // Nashville degrees follow the shifted key; named chords move only for a capo.
  const chordContext = (entry, section) => {
    const offset = entry.transpose ?? section.transpose ?? 0
    return { key: transposeKey(key, offset - (capo || 0)), shift: -(capo || 0), fromKey: key, toKey: shapeKey }
  }

  const pages = []
  let pageBuffer = []
  let currentWeight = 0

  const flushPage = () => {
    if (!pageBuffer.length) return
    const footerLines = []
    if (metadata.owner) footerLines.push(`<span class="s2h-footer-owner">&copy; ${esc(metadata.owner)}</span>`)
    if (metadata.license) footerLines.push(`<span class="s2h-footer-license">${esc(metadata.license)}</span>`)
    const footer = footerLines.length ? `\n<footer class="s2h-page-footer">${footerLines.join(' ')}</footer>` : ''
    pages.push(`<section class="s2h-page" data-page="${pages.length + 1}">\n${pageBuffer.join('\n')}${footer}\n</section>`)
    pageBuffer = []
    currentWeight = 0
  }

  const appendToPage = (html, weight = 0, { beforeFlush, afterFlush } = {}) => {
    if (currentWeight > 0 && currentWeight + weight > PAGE_BUDGET) {
      beforeFlush?.()
      flushPage()
      afterFlush?.()
    }
    pageBuffer.push(html)
    currentWeight += weight
  }

  // Metadata ---------------------------------------------------------------------
  const metaLines = [`<h2 class="s2h-meta-title">${esc(metadata.title)}</h2>`]
  if (metadata.authors?.length) metaLines.push(`<p class="s2h-meta-authors">${esc(metadata.authors.join(', '))}</p>`)
  if (key) metaLines.push(`<p class="s2h-meta-key"><strong>Key:</strong> ${esc(formatKey(key))}</p>`)
  if (metadata.tempo != null) metaLines.push(`<p class="s2h-meta-tempo"><strong>Tempo:</strong> ${esc(metadata.tempo)}</p>`)
  if (metadata.timeSignature) metaLines.push(`<p class="s2h-meta-time"><strong>Time:</strong> ${esc(metadata.timeSignature)}</p>`)
  if (capo) metaLines.push(`<p class="s2h-meta-capo"><strong>Capo:</strong> ${capo}${shapeKey ? ` <span class="s2h-capo-shapes">(${esc(formatKey(shapeKey))} shapes)</span>` : ''}</p>`)
  appendToPage(['<section class="s2h-meta">', ...metaLines, '</section>'].join('\n'), metaLines.length * LINE_WEIGHTS.metaLine)

  // Chord summary ------------------------------------------------------------------
  const chordSpan = (chord, context) => `<span class="s2h-chord">${esc(resolveChord(chord, context))}</span>`
  const chordLineHtml = (line, context) => line.map((item) => (item.type === 'repeat'
    ? `<span class="s2h-repeat">(${item.chords.map((chord) => chordSpan(chord, context)).join(' ')})${item.times > 1 ? ` <span class="s2h-repeat-count">x${item.times}</span>` : ''}</span>`
    : chordSpan(item, context))).join(' ')
  const chordParagraphs = []
  for (const { entry, section } of entries) {
    const definition = definitions.get(section.chordDefinitionId)
    const chordLines = definition ? (definition.lines?.length ? definition.lines : [definition.progression]) : []
    if (!chordLines.length) continue
    const context = chordContext(entry, section)
    const body = chordLines.map((line) => chordLineHtml(line, context)).join('<br class="s2h-line-break"/>')
    chordParagraphs.push(`<p class="s2h-chord-line"><span class="s2h-chord-section-label">${esc(section.name)}</span> ${body}</p>`)
  }
  appendToPage(['<section class="s2h-chords"><h3 class="s2h-chords-title">Chords</h3>', ...chordParagraphs, '</section>'].join('\n'),
    LINE_WEIGHTS.chordsHeading + chordParagraphs.length * LINE_WEIGHTS.chordParagraph)

  // Lyric sections -------------------------------------------------------------------
  const occurrences = new Map()
  for (const { entry, section } of entries) {
    const sectionSlug = slug(section.name)
    const occurrence = (occurrences.get(sectionSlug) || 0) + 1
    occurrences.set(sectionSlug, occurrence)
    const sectionStart = `<section id="${occurrence > 1 ? `${sectionSlug}-${occurrence}` : sectionSlug}" class="s2h-section s2h-section-${sectionSlug}">`
    const progression = definitions.get(section.chordDefinitionId)?.progression || []
    const context = chordContext(entry, section)
    let sectionOpen = false
    const openSection = () => { if (!sectionOpen) { appendToPage(sectionStart); sectionOpen = true } }
    const closeSection = () => { if (sectionOpen) { pageBuffer.push('</section>'); sectionOpen = false } }

    openSection()
    appendToPage(`<h3 class="s2h-section-title">${esc(section.name)}</h3>`, LINE_WEIGHTS.sectionHeading, { beforeFlush: closeSection, afterFlush: openSection })
    for (const line of section.lines) {
      const html = line.parts.map((part) => {
        if (part.type !== 'chordEvent') return esc(part.text)
        const chord = progression.length ? progression[part.progressionIndex % progression.length] : null
        return `<sup class="s2h-chord">${esc(resolveChord(chord, context))}</sup>`
      }).join('')
      appendToPage(`<p class="s2h-lyric-line">${html}</p>`, LINE_WEIGHTS.lyricLine, {
        beforeFlush: closeSection,
        afterFlush: () => {
          openSection()
          appendToPage(`<h3 class="s2h-section-title s2h-section-title-continued">${esc(section.name)} <span class="s2h-continued-label">(continued)</span></h3>`, LINE_WEIGHTS.sectionHeading)
        },
      })
    }
    closeSection()
  }
  flushPage()

  return {
    html: ['<article class="s2h-song">', pages.join('\n'), '</article>'].join('\n'),
    arrangements: song.arrangements.map((entry) => entry.name),
    song: {
      title: metadata.title, key: formatKey(key) || null, tempo: metadata.tempo ?? null, authors: metadata.authors || [],
      time: metadata.timeSignature || null, owner: metadata.owner || null, license: metadata.license || null, capo,
    },
    diagnostics,
  }
}
