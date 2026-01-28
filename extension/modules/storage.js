/**
 * SyllaBud Storage Module
 * Handles all local storage operations using chrome.storage.local
 * No cloud DB, no user auth - all data stays local
 */

const STORAGE_KEYS = {
  COURSES: 'syllabud_courses',
  ACTIVE_COURSE: 'syllabud_active_course',
  SETTINGS: 'syllabud_settings'
};

/**
 * Default settings for new installations
 */
const DEFAULT_SETTINGS = {
  treatUnfilledAs: 100,
  ics: {
    defaultReminderMinutes: 1440 // 1 day
  },
  backendUrl: 'http://localhost:3000'
};

/**
 * Create empty course data structure
 */
function createEmptyCourse(url = '', type = 'html') {
  return {
    id: generateId(),
    course: {
      title: '',
      institution: '',
      term: '',
      instructor: '',
      source: { url, type }
    },
    grading: {
      schemeType: 'unknown',
      categories: [],
      extraCredit: [],
      letterGradeScale: [],
      gotchas: {}
    },
    assignments: [],
    policies: {},
    raw: {
      extractedText: '',
      chunks: []
    },
    userGrades: {},
    settings: {
      treatUnfilledAs: 100,
      ics: { defaultReminderMinutes: 1440 }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Generate unique ID
 */
function generateId() {
  return `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all stored courses
 */
async function getAllCourses() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.COURSES);
  return result[STORAGE_KEYS.COURSES] || [];
}

/**
 * Get active course ID
 */
async function getActiveCourseId() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_COURSE);
  return result[STORAGE_KEYS.ACTIVE_COURSE] || null;
}

/**
 * Get active course data
 */
async function getActiveCourse() {
  const [courses, activeId] = await Promise.all([
    getAllCourses(),
    getActiveCourseId()
  ]);
  
  if (!activeId) return null;
  return courses.find(c => c.id === activeId) || null;
}

/**
 * Set active course
 */
async function setActiveCourse(courseId) {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_COURSE]: courseId });
}

/**
 * Save a course (creates or updates)
 */
async function saveCourse(courseData) {
  const courses = await getAllCourses();
  const existingIndex = courses.findIndex(c => c.id === courseData.id);
  
  courseData.updatedAt = Date.now();
  
  if (existingIndex >= 0) {
    courses[existingIndex] = courseData;
  } else {
    courses.push(courseData);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: courses });
  return courseData;
}

/**
 * Delete a course
 */
async function deleteCourse(courseId) {
  const courses = await getAllCourses();
  const filtered = courses.filter(c => c.id !== courseId);
  await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: filtered });
  
  // Clear active if this was active
  const activeId = await getActiveCourseId();
  if (activeId === courseId) {
    await setActiveCourse(null);
  }
}

/**
 * Get global settings
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * Save global settings
 */
async function saveSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}

/**
 * Update user grades for active course
 */
async function updateUserGrades(grades) {
  const course = await getActiveCourse();
  if (!course) throw new Error('No active course');
  
  course.userGrades = { ...course.userGrades, ...grades };
  await saveCourse(course);
  return course;
}

/**
 * Clear all data (for debugging/reset)
 */
async function clearAllData() {
  await chrome.storage.local.clear();
}

/**
 * Get storage usage stats
 */
async function getStorageStats() {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  const courses = await getAllCourses();
  return {
    bytesUsed: bytesInUse,
    courseCount: courses.length,
    maxBytes: chrome.storage.local.QUOTA_BYTES
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    createEmptyCourse,
    generateId,
    getAllCourses,
    getActiveCourseId,
    getActiveCourse,
    setActiveCourse,
    saveCourse,
    deleteCourse,
    getSettings,
    saveSettings,
    updateUserGrades,
    clearAllData,
    getStorageStats
  };
}

// Export for ES modules
export {
  STORAGE_KEYS,
  createEmptyCourse,
  generateId,
  getAllCourses,
  getActiveCourseId,
  getActiveCourse,
  setActiveCourse,
  saveCourse,
  deleteCourse,
  getSettings,
  saveSettings,
  updateUserGrades,
  clearAllData,
  getStorageStats
};
