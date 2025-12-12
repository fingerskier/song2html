/**
 * Minimal test runner - no external dependencies required
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import songToHtml from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const outputDir = join(fixturesDir, 'output');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

let passed = 0;
let failed = 0;
let currentSuite = '';
const failures = [];

export function describe(name, fn) {
  currentSuite = name;
  console.log(`\n${COLORS.yellow}${name}${COLORS.reset}`);
  fn();
}

export function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ${COLORS.green}✓${COLORS.reset} ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ${COLORS.red}✗${COLORS.reset} ${name}`);
    failures.push({ suite: currentSuite, name, error: err });
  }
}

export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      const actualStr = JSON.stringify(actual);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(`Expected ${expectedStr} but got ${actualStr}`);
      }
    },
    toContain(substring) {
      if (typeof actual !== 'string' || !actual.includes(substring)) {
        throw new Error(`Expected "${String(actual).slice(0, 100)}..." to contain "${substring}"`);
      }
    },
    toMatch(pattern) {
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${String(actual).slice(0, 100)}..." to match ${pattern}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(len) {
      if (!actual || actual.length !== len) {
        throw new Error(`Expected length ${len} but got ${actual ? actual.length : 'undefined'}`);
      }
    },
    toBeGreaterThan(val) {
      if (actual <= val) {
        throw new Error(`Expected ${actual} to be greater than ${val}`);
      }
    },
    not: {
      toContain(substring) {
        if (typeof actual === 'string' && actual.includes(substring)) {
          throw new Error(`Expected not to contain "${substring}"`);
        }
      },
    },
  };
}

export function printSummary() {
  console.log('\n' + '─'.repeat(50));

  if (failures.length > 0) {
    console.log(`\n${COLORS.red}Failures:${COLORS.reset}\n`);
    failures.forEach(({ suite, name, error }) => {
      console.log(`  ${COLORS.red}${suite} > ${name}${COLORS.reset}`);
      console.log(`    ${COLORS.gray}${error.message}${COLORS.reset}\n`);
    });
  }

  console.log(`\n${COLORS.green}Passed: ${passed}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);
  console.log(`${COLORS.gray}Total:  ${passed + failed}${COLORS.reset}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Generate HTML output files for each fixture
 */
function generateFixtureOutputs() {
  console.log(`\n${COLORS.yellow}Generating fixture outputs...${COLORS.reset}`);

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Get all .txt fixture files
  const fixtureFiles = readdirSync(fixturesDir).filter(f => f.endsWith('.txt'));

  fixtureFiles.forEach(filename => {
    const inputPath = join(fixturesDir, filename);
    const outputFilename = filename.replace('.txt', '.html');
    const outputPath = join(outputDir, outputFilename);

    try {
      const source = readFileSync(inputPath, 'utf-8');
      const result = songToHtml(source);

      // Create a complete HTML document
      const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.song.title || filename}</title>
  <style>
    .s2h-chord { color: #0066cc; font-weight: bold; }
    .s2h-section { margin: 1em 0; padding: 0.5em; border-left: 3px solid #ccc; }
    .s2h-meta { background: #f5f5f5; padding: 1em; margin-bottom: 1em; }
  </style>
</head>
<body>
${result.html}
</body>
</html>`;

      writeFileSync(outputPath, htmlDoc, 'utf-8');
      console.log(`  ${COLORS.green}✓${COLORS.reset} ${filename} → ${outputFilename}`);
    } catch (err) {
      console.log(`  ${COLORS.red}✗${COLORS.reset} ${filename}: ${err.message}`);
    }
  });

  console.log(`${COLORS.gray}Output directory: ${outputDir}${COLORS.reset}`);
}

// Run tests
import('./index.test.js').then(() => {
  printSummary();
  generateFixtureOutputs();
}).catch(err => {
  console.error('Error loading tests:', err);
  process.exit(1);
});
