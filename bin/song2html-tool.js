#!/usr/bin/env node
import { runTool, TOOL_NAMES } from '../src/mcp-tools.js'

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

const name = process.argv[2]
if (!name || name === '--help' || name === '-h') {
  process.stderr.write(`usage: song2html-tool <tool> [json-args]\n\ntools: ${TOOL_NAMES.join(', ')}\n`)
  process.exit(name ? 0 : 2)
}

let raw = process.argv[3]
if (raw === undefined) {
  if (process.stdin.isTTY) raw = '{}'
  else raw = await readStdin()
}

let args = {}
if (raw && raw.trim()) {
  try {
    args = JSON.parse(raw)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: `invalid JSON: ${error.message}` })}\n`)
    process.exit(1)
  }
}

try {
  const result = await runTool(name, args)
  const [first, ...rest] = result?.content ?? []
  const line = (text) => (text.endsWith('\n') ? text : `${text}\n`)
  process.stdout.write(line(first?.text ?? JSON.stringify(result)))
  // Further blocks carry diagnostics (render_html errors); keep stdout to the primary payload.
  for (const block of rest) process.stderr.write(line(block.text ?? JSON.stringify(block)))
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`)
  process.exit(1)
}
