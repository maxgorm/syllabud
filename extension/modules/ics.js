/**
 * SyllaBud ICS Calendar Generation Module
 * Generates .ics files with VALARM reminders
 */

/**
 * Format date to ICS format (YYYYMMDD or YYYYMMDDTHHMMSSZ)
 */
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

/**
 * Generate unique UID for calendar event
 */
function generateUID() {
  return `syllabud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@syllabud.app`;
}

/**
 * Escape special characters in ICS text fields
 */
function escapeICSText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long lines per ICS spec (max 75 chars per line)
 */
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
      // Continuation lines start with space/tab
      parts.push(' ' + remaining.substring(0, maxLength - 1));
      remaining = remaining.substring(maxLength - 1);
    }
  }
  
  return parts.join('\r\n');
}

/**
 * Create VALARM component for reminder
 */
function createVALARM(minutesBefore = 1440) {
  // Convert minutes to duration format
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

/**
 * Create a single VEVENT
 */
function createVEVENT(assignment, reminderMinutes = 1440) {
  const uid = generateUID();
  const now = formatICSDate(new Date(), true);
  
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`
  ];
  
  // Handle date - if no time, make it all-day event
  if (assignment.dueDate) {
    const dueDate = new Date(assignment.dueDate);
    
    if (assignment.dueTime) {
      // Specific time provided
      lines.push(`DTSTART:${formatICSDate(dueDate, true)}`);
      lines.push(`DTEND:${formatICSDate(dueDate, true)}`);
    } else {
      // All-day event
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(dueDate, false)}`);
      // For all-day, end date is next day (exclusive)
      const nextDay = new Date(dueDate);
      nextDay.setDate(nextDay.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${formatICSDate(nextDay, false)}`);
    }
  }
  
  // Summary (title)
  const summary = assignment.title || 'Untitled Assignment';
  lines.push(foldLine(`SUMMARY:${escapeICSText(summary)}`));
  
  // Description
  const descParts = [];
  if (assignment.category) descParts.push(`Category: ${assignment.category}`);
  if (assignment.weight) descParts.push(`Weight: ${assignment.weight}%`);
  if (assignment.points) descParts.push(`Points: ${assignment.points}`);
  if (assignment.description) descParts.push(assignment.description);
  
  if (descParts.length > 0) {
    lines.push(foldLine(`DESCRIPTION:${escapeICSText(descParts.join('\\n'))}`));
  }
  
  // Categories
  if (assignment.category) {
    lines.push(`CATEGORIES:${escapeICSText(assignment.category)}`);
  }
  
  // Add alarm/reminder
  lines.push(createVALARM(reminderMinutes));
  
  lines.push('END:VEVENT');
  
  return lines.join('\r\n');
}

/**
 * Generate complete ICS file content
 */
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
  
  // Add calendar name
  const calName = courseData.course?.title || 'Course Calendar';
  lines.push(foldLine(`X-WR-CALNAME:${escapeICSText(calName)}`));
  
  // Filter assignments
  const assignments = courseData.assignments || [];
  const validAssignments = assignments.filter(a => {
    if (!a.dueDate) {
      return includeNoDueDate;
    }
    return true;
  });
  
  // Create events
  for (const assignment of validAssignments) {
    lines.push(createVEVENT(assignment, reminderMinutes));
  }
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

/**
 * Generate filename for ICS download
 */
function generateICSFilename(courseData) {
  const title = courseData.course?.title || 'Course';
  const term = courseData.course?.term || '';
  
  // Clean up for filename
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

/**
 * Download ICS file
 */
function downloadICS(courseData, options = {}) {
  const icsContent = generateICS(courseData, options);
  const filename = generateICSFilename(courseData);
  
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
  
  return { filename, size: icsContent.length };
}

/**
 * Get ICS preview stats
 */
function getICSPreview(courseData, options = {}) {
  const { includeNoDueDate = false } = options;
  const assignments = courseData.assignments || [];
  
  const withDate = assignments.filter(a => a.dueDate);
  const withoutDate = assignments.filter(a => !a.dueDate);
  
  const earliestDate = withDate.length > 0 
    ? new Date(Math.min(...withDate.map(a => new Date(a.dueDate))))
    : null;
  const latestDate = withDate.length > 0 
    ? new Date(Math.max(...withDate.map(a => new Date(a.dueDate))))
    : null;
  
  return {
    totalAssignments: assignments.length,
    withDueDate: withDate.length,
    withoutDueDate: withoutDate.length,
    eventsToExport: includeNoDueDate ? assignments.length : withDate.length,
    dateRange: {
      earliest: earliestDate?.toISOString() || null,
      latest: latestDate?.toISOString() || null
    }
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatICSDate,
    generateUID,
    escapeICSText,
    foldLine,
    createVALARM,
    createVEVENT,
    generateICS,
    generateICSFilename,
    downloadICS,
    getICSPreview
  };
}

export {
  formatICSDate,
  generateUID,
  escapeICSText,
  foldLine,
  createVALARM,
  createVEVENT,
  generateICS,
  generateICSFilename,
  downloadICS,
  getICSPreview
};
