/**
 * SyllaBud Test Runner
 * Runs all unit tests
 */

import { runTests as runGradeTests } from './grade.test.js';
import { runTests as runICSTests } from './ics.test.js';

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║           SyllaBud Test Suite                     ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

const results = {
  grade: runGradeTests(),
  ics: runICSTests()
};

// Summary
const totalPassed = results.grade.passed + results.ics.passed;
const totalFailed = results.grade.failed + results.ics.failed;

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║               FINAL SUMMARY                       ║');
console.log('╠═══════════════════════════════════════════════════╣');
console.log(`║  Grade Calculator Tests: ${results.grade.passed} passed, ${results.grade.failed} failed          ║`);
console.log(`║  ICS Generation Tests:   ${results.ics.passed} passed, ${results.ics.failed} failed          ║`);
console.log('╠═══════════════════════════════════════════════════╣');
console.log(`║  TOTAL: ${totalPassed} passed, ${totalFailed} failed                       ║`);
console.log('╚═══════════════════════════════════════════════════╝\n');

process.exit(totalFailed > 0 ? 1 : 0);
