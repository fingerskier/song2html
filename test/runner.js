/**
 * Minimal test runner - no external dependencies required
 */

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
    toContain(item) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain "${item}"`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(item)) {
          throw new Error(`Expected "${String(actual).slice(0, 100)}..." to contain "${item}"`);
        }
      } else {
        throw new Error(`Expected string or array but got ${typeof actual}`);
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

// Run tests
Promise.all([
  import('./index.test.js'),
  import('./state.test.js')
]).then(() => {
  printSummary();
}).catch(err => {
  console.error('Error loading tests:', err);
  process.exit(1);
});
