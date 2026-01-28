/**
 * SyllaBud ICS Generation Tests
 */

// ICS Functions (inline for testing)
function formatICSDate(date, includeTime = false) {
  const d = new Date(date);
  
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  
  if (!includeTime) {
    return `${year}${month}${day}`;
  }
  
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeICSText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  const maxLength = 75;
  if (line.length <= maxLength) return line;
  
  const parts = [];
  let remaining = line;
  
  while (remaining.length > 0) {
    if (parts.length === 0) {
      parts.push(remaining.substring(0, maxLength));
      remaining = remaining.substring(maxLength);
    } else {
      parts.push(' ' + remaining.substring(0, maxLength - 1));
      remaining = remaining.substring(maxLength - 1);
    }
  }
  
  return parts.join('\r\n');
}

function createVALARM(minutesBefore = 1440) {
  const totalMinutes = minutesBefore;
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  
  let duration = '-P';
  if (days > 0) duration += `${days}D`;
  if (hours > 0 || minutes > 0) {
    duration += 'T';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
  }
  if (duration === '-P') duration = '-PT0M';
  
  return [
    'BEGIN:VALARM',
    'TRIGGER:' + duration,
    'ACTION:DISPLAY',
    'DESCRIPTION:Assignment due soon',
    'END:VALARM'
  ].join('\r\n');
}

function generateICS(courseData, options = {}) {
  const {
    includeNoDueDate = false,
    reminderMinutes = 1440
  } = options;
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SyllaBud//Chrome Extension//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  
  const calName = courseData.course?.title || 'Course Calendar';
  lines.push(`X-WR-CALNAME:${escapeICSText(calName)}`);
  
  const assignments = courseData.assignments || [];
  const validAssignments = assignments.filter(a => {
    if (!a.dueDate) {
      return includeNoDueDate;
    }
    return true;
  });
  
  for (const assignment of validAssignments) {
    const uid = `syllabud-test-${Date.now()}@syllabud.app`;
    
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date(), true)}`);
    
    if (assignment.dueDate) {
      const dueDate = new Date(assignment.dueDate);
      
      if (assignment.dueTime) {
        lines.push(`DTSTART:${formatICSDate(dueDate, true)}`);
        lines.push(`DTEND:${formatICSDate(dueDate, true)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${formatICSDate(dueDate, false)}`);
        const nextDay = new Date(dueDate);
        nextDay.setDate(nextDay.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${formatICSDate(nextDay, false)}`);
      }
    }
    
    lines.push(`SUMMARY:${escapeICSText(assignment.title || 'Untitled Assignment')}`);
    
    if (assignment.category) {
      lines.push(`CATEGORIES:${escapeICSText(assignment.category)}`);
    }
    
    lines.push(createVALARM(reminderMinutes));
    lines.push('END:VEVENT');
  }
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

function generateICSFilename(courseData) {
  const title = courseData.course?.title || 'Course';
  const term = courseData.course?.term || '';
  
  const cleanTitle = title
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 30);
  
  const cleanTerm = term
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 20);
  
  if (cleanTerm) {
    return `SyllaBud_${cleanTitle}_${cleanTerm}.ics`;
  }
  return `SyllaBud_${cleanTitle}.ics`;
}

function getICSPreview(courseData, options = {}) {
  const { includeNoDueDate = false } = options;
  const assignments = courseData.assignments || [];
  
  const withDate = assignments.filter(a => a.dueDate);
  const withoutDate = assignments.filter(a => !a.dueDate);
  
  return {
    totalAssignments: assignments.length,
    withDueDate: withDate.length,
    withoutDueDate: withoutDate.length,
    eventsToExport: includeNoDueDate ? assignments.length : withDate.length
  };
}

// ============== TESTS ==============

function runTests() {
  let passed = 0;
  let failed = 0;
  
  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }
  
  function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message}\n    Expected: ${expected}\n    Actual: ${actual}`);
    }
  }
  
  function assertContains(str, substring, message = '') {
    if (!str.includes(substring)) {
      throw new Error(`${message}\n    String does not contain: "${substring}"\n    String: ${str.substring(0, 200)}...`);
    }
  }
  
  function assertNotContains(str, substring, message = '') {
    if (str.includes(substring)) {
      throw new Error(`${message}\n    String should not contain: "${substring}"`);
    }
  }
  
  console.log('\n========== ICS GENERATION TESTS ==========\n');
  
  // Test 1: Format date without time (all-day event)
  test('formats date without time for all-day events', () => {
    const date = new Date('2024-03-15T12:00:00Z');
    const formatted = formatICSDate(date, false);
    assertEqual(formatted, '20240315');
  });
  
  // Test 2: Format date with time
  test('formats date with time in UTC', () => {
    const date = new Date('2024-03-15T14:30:00Z');
    const formatted = formatICSDate(date, true);
    assertEqual(formatted, '20240315T143000Z');
  });
  
  // Test 3: Escape special characters
  test('escapes ICS special characters', () => {
    assertEqual(escapeICSText('Hello, World'), 'Hello\\, World');
    assertEqual(escapeICSText('Test; value'), 'Test\\; value');
    assertEqual(escapeICSText('Line1\nLine2'), 'Line1\\nLine2');
    assertEqual(escapeICSText('Back\\slash'), 'Back\\\\slash');
  });
  
  // Test 4: Fold long lines
  test('folds lines longer than 75 characters', () => {
    const longLine = 'A'.repeat(100);
    const folded = foldLine(longLine);
    const lines = folded.split('\r\n');
    
    assertEqual(lines[0].length, 75);
    assertEqual(lines[1].startsWith(' '), true);
  });
  
  // Test 5: Short lines not folded
  test('does not fold short lines', () => {
    const shortLine = 'Short line';
    const folded = foldLine(shortLine);
    assertEqual(folded, shortLine);
  });
  
  // Test 6: VALARM with 1 day trigger
  test('creates VALARM with 1 day trigger', () => {
    const alarm = createVALARM(1440);
    assertContains(alarm, 'TRIGGER:-P1D');
    assertContains(alarm, 'ACTION:DISPLAY');
  });
  
  // Test 7: VALARM with hours and minutes
  test('creates VALARM with hours and minutes', () => {
    const alarm = createVALARM(90); // 1.5 hours
    assertContains(alarm, 'TRIGGER:-PT1H30M');
  });
  
  // Test 8: Generate valid ICS structure
  test('generates valid ICS calendar structure', () => {
    const courseData = {
      course: { title: 'Test Course', term: 'Fall 2024' },
      assignments: [
        { id: 'a1', title: 'Assignment 1', dueDate: '2024-03-15' },
        { id: 'a2', title: 'Assignment 2', dueDate: '2024-03-20' }
      ]
    };
    
    const ics = generateICS(courseData);
    
    assertContains(ics, 'BEGIN:VCALENDAR');
    assertContains(ics, 'END:VCALENDAR');
    assertContains(ics, 'VERSION:2.0');
    assertContains(ics, 'PRODID:-//SyllaBud//Chrome Extension//EN');
    assertContains(ics, 'BEGIN:VEVENT');
    assertContains(ics, 'END:VEVENT');
    assertContains(ics, 'SUMMARY:Assignment 1');
    assertContains(ics, 'SUMMARY:Assignment 2');
  });
  
  // Test 9: Exclude assignments without due date by default
  test('excludes assignments without due date by default', () => {
    const courseData = {
      course: { title: 'Test Course' },
      assignments: [
        { id: 'a1', title: 'With Date', dueDate: '2024-03-15' },
        { id: 'a2', title: 'No Date' } // No dueDate
      ]
    };
    
    const ics = generateICS(courseData);
    
    assertContains(ics, 'SUMMARY:With Date');
    assertNotContains(ics, 'SUMMARY:No Date');
  });
  
  // Test 10: Include assignments without due date when option set
  test('includes TBD assignments when option enabled', () => {
    const courseData = {
      course: { title: 'Test Course' },
      assignments: [
        { id: 'a1', title: 'With Date', dueDate: '2024-03-15' },
        { id: 'a2', title: 'No Date' }
      ]
    };
    
    const ics = generateICS(courseData, { includeNoDueDate: true });
    
    assertContains(ics, 'SUMMARY:With Date');
    assertContains(ics, 'SUMMARY:No Date');
  });
  
  // Test 11: Generate filename
  test('generates correct filename', () => {
    const courseData = {
      course: { title: 'Introduction to Computer Science', term: 'Fall 2024' }
    };
    
    const filename = generateICSFilename(courseData);
    
    assertContains(filename, 'SyllaBud_');
    assertContains(filename, 'Introduction');
    assertContains(filename, 'Fall_2024');
    assertContains(filename, '.ics');
  });
  
  // Test 12: Filename without term
  test('generates filename without term', () => {
    const courseData = {
      course: { title: 'Test Course' }
    };
    
    const filename = generateICSFilename(courseData);
    assertEqual(filename, 'SyllaBud_Test_Course.ics');
  });
  
  // Test 13: Preview statistics
  test('generates correct preview statistics', () => {
    const courseData = {
      assignments: [
        { id: 'a1', title: 'Assignment 1', dueDate: '2024-03-15' },
        { id: 'a2', title: 'Assignment 2', dueDate: '2024-03-20' },
        { id: 'a3', title: 'TBD Assignment' }
      ]
    };
    
    const preview = getICSPreview(courseData);
    
    assertEqual(preview.totalAssignments, 3);
    assertEqual(preview.withDueDate, 2);
    assertEqual(preview.withoutDueDate, 1);
    assertEqual(preview.eventsToExport, 2);
  });
  
  // Test 14: Preview with TBD included
  test('preview shows correct count with TBD included', () => {
    const courseData = {
      assignments: [
        { id: 'a1', title: 'Assignment 1', dueDate: '2024-03-15' },
        { id: 'a2', title: 'TBD Assignment' }
      ]
    };
    
    const preview = getICSPreview(courseData, { includeNoDueDate: true });
    assertEqual(preview.eventsToExport, 2);
  });
  
  // Test 15: All-day events use correct format
  test('creates all-day events without time', () => {
    const courseData = {
      course: { title: 'Test' },
      assignments: [
        { id: 'a1', title: 'All Day Event', dueDate: '2024-03-15' }
      ]
    };
    
    const ics = generateICS(courseData);
    
    assertContains(ics, 'DTSTART;VALUE=DATE:20240315');
    assertContains(ics, 'DTEND;VALUE=DATE:20240316'); // Next day
  });
  
  // Test 16: Category in ICS
  test('includes category in ICS event', () => {
    const courseData = {
      course: { title: 'Test' },
      assignments: [
        { id: 'a1', title: 'Homework 1', dueDate: '2024-03-15', category: 'Homework' }
      ]
    };
    
    const ics = generateICS(courseData);
    assertContains(ics, 'CATEGORIES:Homework');
  });
  
  // Test 17: Custom reminder time
  test('uses custom reminder time', () => {
    const courseData = {
      course: { title: 'Test' },
      assignments: [
        { id: 'a1', title: 'Test', dueDate: '2024-03-15' }
      ]
    };
    
    const ics = generateICS(courseData, { reminderMinutes: 60 });
    assertContains(ics, 'TRIGGER:-PT1H');
  });
  
  // Test 18: Calendar name
  test('sets calendar name', () => {
    const courseData = {
      course: { title: 'My Course' },
      assignments: []
    };
    
    const ics = generateICS(courseData);
    assertContains(ics, 'X-WR-CALNAME:My Course');
  });
  
  // Summary
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  
  return { passed, failed };
}

// Run tests if executed directly
if (typeof process !== 'undefined' && process.argv[1].includes('ics.test')) {
  runTests();
}

export { runTests };
