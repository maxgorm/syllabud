/**
 * SyllaBud Service Worker (Background Script)
 * Manifest V3 compliant background service worker
 */

// Import modules using importScripts for service worker context
// Note: In MV3, we use dynamic imports or bundle everything

/**
 * Storage helper functions (inline for service worker)
 */
const StorageHelper = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },
  
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  
  async getSettings() {
    const settings = await this.get('syllabud_settings');
    return {
      treatUnfilledAs: 100,
      ics: { defaultReminderMinutes: 1440 },
      backendUrl: 'http://localhost:3000',
      ...settings
    };
  }
};

/**
 * Message handlers for communication with content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  handleMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  return true; // Keep message channel open for async response
});

/**
 * Main message handler
 */
async function handleMessage(message, sender) {
  const { action, data } = message;
  
  switch (action) {
    case 'EXTRACT_TEXT':
      // Support both sender.tab (from content script) and data.tabId (from popup)
      const tab = data?.tabId ? { id: data.tabId } : sender.tab;
      return handleExtractText(tab);
    
    case 'ANALYZE_SYLLABUS':
      return handleAnalyzeSyllabus(data);
    
    case 'SAVE_COURSE':
      return handleSaveCourse(data);
    
    case 'GET_ACTIVE_COURSE':
      return handleGetActiveCourse();
    
    case 'GET_ALL_COURSES':
      return handleGetAllCourses();
    
    case 'DELETE_COURSE':
      return handleDeleteCourse(data.courseId);
    
    case 'UPDATE_GRADES':
      return handleUpdateGrades(data);
    
    case 'CHAT':
      return handleChat(data);
    
    case 'CHECK_BACKEND':
      return handleCheckBackend();
    
    case 'GET_SETTINGS':
      return handleGetSettings();
    
    case 'SAVE_SETTINGS':
      return handleSaveSettings(data);
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Extract text from current tab
 */
async function handleExtractText(tab) {
  if (!tab || !tab.id) {
    throw new Error('No active tab');
  }
  
  // Get full tab info if only ID provided
  let fullTab = tab;
  if (!tab.url) {
    fullTab = await chrome.tabs.get(tab.id);
  }
  
  // Inject extraction script and get result
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageText
  });
  
  if (!results || results.length === 0) {
    throw new Error('Failed to extract text from page');
  }
  
  // Ensure URL is included
  const data = results[0].result;
  data.url = data.url || fullTab.url;
  
  return { success: true, data };
}

/**
 * Function to inject into page for text extraction
 */
function extractPageText() {
  // Detect page type
  const url = window.location.href.toLowerCase();
  let pageType = 'html';
  
  if (url.includes('docs.google.com/document')) {
    pageType = 'google_doc';
  } else if (url.includes('canvas') || url.includes('instructure') || 
             url.includes('blackboard') || url.includes('moodle')) {
    pageType = 'lms';
  } else if (url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('/pdf/') || 
             document.contentType === 'application/pdf') {
    pageType = 'pdf';
  }
  
  // Special handling for PDFs
  if (pageType === 'pdf') {
    // Try multiple PDF viewer text extraction methods
    
    // Method 1: PDF.js text layers (Firefox, some extensions)
    const textLayerSelectors = [
      '.textLayer span',
      '.text-layer span', 
      '.pdfViewer .textLayer span',
      '#viewer .textLayer span',
      '.pdf-viewer .textLayer span',
      '[data-page-number] .textLayer span'
    ];
    
    for (const selector of textLayerSelectors) {
      const textLayers = document.querySelectorAll(selector);
      if (textLayers.length > 0) {
        const pdfText = Array.from(textLayers)
          .map(span => span.textContent || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (pdfText.length > 100) {
          return buildResult(pdfText, 'pdf');
        }
      }
    }
    
    // Method 2: Check for Google Drive PDF viewer
    if (url.includes('drive.google.com') || url.includes('docs.google.com/viewer')) {
      const driveText = document.querySelector('.drive-viewer-paginated-page, .ndfHFb-c4YZDc');
      if (driveText) {
        const text = driveText.innerText || driveText.textContent || '';
        if (text.length > 100) {
          return buildResult(text, 'pdf');
        }
      }
    }
    
    // Method 3: Try to get any visible text content from the page
    const bodyText = document.body?.innerText || '';
    if (bodyText.length > 200) {
      // Filter out common PDF viewer UI text
      const uiPatterns = /^(zoom|page|of|download|print|rotate|search|bookmarks?|thumbnails?|presentation mode)$/im;
      const lines = bodyText.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !uiPatterns.test(trimmed);
      });
      const filteredText = lines.join('\n').trim();
      
      if (filteredText.length > 100) {
        return buildResult(filteredText, 'pdf');
      }
    }
    
    // Method 4: Chrome's native PDF viewer (embed) - can't extract
    const embed = document.querySelector('embed[type="application/pdf"]');
    if (embed) {
      return {
        pageType: 'pdf',
        url: window.location.href,
        extractedText: '',
        chunks: [],
        charCount: 0,
        error: 'PDF_NATIVE_VIEWER'
      };
    }
    
    // Final fallback - try body text
    if (bodyText.length > 50) {
      return buildResult(bodyText, 'pdf');
    }
    
    // No text found in PDF
    return {
      pageType: 'pdf',
      url: window.location.href,
      extractedText: '',
      chunks: [],
      charCount: 0,
      error: 'PDF_NATIVE_VIEWER'
    };
  }
  
  // Get main content
  const mainSelectors = [
    'main', 'article', '[role="main"]', '.content', '#content',
    '.syllabus', '#syllabus', '.course-content', '.kix-page',
    '.syllabus_content', '#course_syllabus', '.wiki-content', '.user_content',
    '.textLayer', '#viewerContainer', '.page-content'
  ];
  
  let content = null;
  for (const selector of mainSelectors) {
    content = document.querySelector(selector);
    if (content) break;
  }
  
  const targetElement = content || document.body;
  
  // Process element recursively
  function processElement(el) {
    if (!el) return '';
    
    const tag = el.tagName?.toLowerCase();
    const ignoredTags = ['script', 'style', 'noscript', 'svg', 'iframe', 'nav'];
    if (ignoredTags.includes(tag)) return '';
    
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';
    
    const style = window.getComputedStyle?.(el);
    if (style?.display === 'none' || style?.visibility === 'hidden') return '';
    
    let result = '';
    
    switch (tag) {
      case 'h1': result = `\n# ${el.textContent}\n`; break;
      case 'h2': result = `\n## ${el.textContent}\n`; break;
      case 'h3': result = `\n### ${el.textContent}\n`; break;
      case 'h4':
      case 'h5':
      case 'h6': result = `\n#### ${el.textContent}\n`; break;
      case 'p': result = `\n${el.textContent}\n`; break;
      case 'li': result = `• ${el.textContent}\n`; break;
      case 'table':
        const rows = el.querySelectorAll('tr');
        result = '\n';
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          const cellTexts = Array.from(cells).map(c => c.textContent.trim());
          result += `| ${cellTexts.join(' | ')} |\n`;
        });
        result += '\n';
        break;
      case 'ul':
      case 'ol':
        result = '\n';
        Array.from(el.children).forEach(child => {
          result += processElement(child);
        });
        result += '\n';
        break;
      default:
        if (el.children && el.children.length > 0) {
          Array.from(el.children).forEach(child => {
            result += processElement(child);
          });
        } else {
          result = el.textContent || '';
        }
    }
    
    return result;
  }
  
  const extractedText = processElement(targetElement)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return buildResult(extractedText, pageType);
  
  // Helper to build result with chunks
  function buildResult(text, type) {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    let chunkId = 0;
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > 1200 && currentChunk.length > 0) {
        chunks.push({ id: `chunk_${chunkId}`, text: currentChunk.trim() });
        chunkId++;
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-20).join(' ');
        currentChunk = overlapWords + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    if (currentChunk.trim()) {
      chunks.push({ id: `chunk_${chunkId}`, text: currentChunk.trim() });
    }
    
    return {
      pageType: type,
      url: window.location.href,
      extractedText: text,
      chunks,
      charCount: text.length
    };
  }
}

/**
 * Analyze syllabus using backend
 */
async function handleAnalyzeSyllabus(data) {
  const { extractedText, url } = data;
  const settings = await StorageHelper.getSettings();
  
  // Call backend to structure syllabus
  const response = await fetch(`${settings.backendUrl}/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'STRUCTURE_SYLLABUS',
      payload: { text: extractedText, sourceUrl: url }
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Backend error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.ok) {
    throw new Error(result.error?.message || 'Failed to analyze syllabus');
  }
  
  return { success: true, data: result.data };
}

/**
 * Save course data
 */
async function handleSaveCourse(courseData) {
  const courses = await StorageHelper.get('syllabud_courses') || [];
  const existingIndex = courses.findIndex(c => c.id === courseData.id);
  
  courseData.updatedAt = Date.now();
  
  if (existingIndex >= 0) {
    courses[existingIndex] = courseData;
  } else {
    courses.push(courseData);
  }
  
  await StorageHelper.set('syllabud_courses', courses);
  await StorageHelper.set('syllabud_active_course', courseData.id);
  
  return { success: true, data: courseData };
}

/**
 * Get active course
 */
async function handleGetActiveCourse() {
  const activeId = await StorageHelper.get('syllabud_active_course');
  if (!activeId) return { success: true, data: null };
  
  const courses = await StorageHelper.get('syllabud_courses') || [];
  const course = courses.find(c => c.id === activeId);
  
  return { success: true, data: course || null };
}

/**
 * Get all courses
 */
async function handleGetAllCourses() {
  const courses = await StorageHelper.get('syllabud_courses') || [];
  return { success: true, data: courses };
}

/**
 * Delete a course
 */
async function handleDeleteCourse(courseId) {
  const courses = await StorageHelper.get('syllabud_courses') || [];
  const filtered = courses.filter(c => c.id !== courseId);
  await StorageHelper.set('syllabud_courses', filtered);
  
  const activeId = await StorageHelper.get('syllabud_active_course');
  if (activeId === courseId) {
    await StorageHelper.set('syllabud_active_course', null);
  }
  
  return { success: true };
}

/**
 * Update user grades
 */
async function handleUpdateGrades(data) {
  const { courseId, grades } = data;
  const courses = await StorageHelper.get('syllabud_courses') || [];
  const courseIndex = courses.findIndex(c => c.id === courseId);
  
  if (courseIndex < 0) {
    throw new Error('Course not found');
  }
  
  courses[courseIndex].userGrades = {
    ...courses[courseIndex].userGrades,
    ...grades
  };
  courses[courseIndex].updatedAt = Date.now();
  
  await StorageHelper.set('syllabud_courses', courses);
  
  return { success: true, data: courses[courseIndex] };
}

function tokenizeForChat(text) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'about', 'have', 'your', 'does', 'into']);

  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function extractQueryPhrases(question) {
  const phrases = [];
  const patterns = [
    /what(?:'s| is) (?:the )?(.+?)(?:\?|$)/i,
    /when(?:'s| is) (.+?)(?:\?|$)/i,
    /how (?:is|are|do|does) (.+?)(?:\?|$)/i,
    /(.+?) policy/i,
    /(.+?) grade/i,
    /(.+?) due/i
  ];

  patterns.forEach((pattern) => {
    const match = question.match(pattern);
    if (match?.[1]) {
      phrases.push(match[1].trim().toLowerCase());
    }
  });

  return phrases;
}

function createFallbackChunks(text, maxChars = 1200, overlapWords = 20) {
  const cleanedText = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleanedText) return [];

  const sentences = cleanedText.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = '';

  sentences.forEach((sentence) => {
    if ((currentChunk + ' ' + sentence).trim().length > maxChars && currentChunk) {
      chunks.push({ id: `chunk_${chunks.length}`, text: currentChunk.trim() });
      const overlap = currentChunk.split(' ').slice(-overlapWords).join(' ');
      currentChunk = `${overlap} ${sentence}`.trim();
    } else {
      currentChunk = `${currentChunk} ${sentence}`.trim();
    }
  });

  if (currentChunk) {
    chunks.push({ id: `chunk_${chunks.length}`, text: currentChunk.trim() });
  }

  return chunks;
}

function scoreChunk(chunkText, queryTokens, queryPhrases) {
  const normalized = (chunkText || '').toLowerCase();
  const chunkTokens = tokenizeForChat(normalized);

  let score = 0;

  queryTokens.forEach((token) => {
    chunkTokens.forEach((chunkToken) => {
      if (chunkToken === token) {
        score += 4;
      } else if (chunkToken.includes(token) || token.includes(chunkToken)) {
        score += 2;
      }
    });
  });

  queryPhrases.forEach((phrase) => {
    if (phrase && normalized.includes(phrase)) {
      score += 8;
    }
  });

  if (/\b(policy|late|attendance|exam|midterm|final|grade|weight|assignment|due)\b/.test(normalized)) {
    score += 1;
  }

  return score;
}

function buildRelevantChunks(course, question, limit = 8) {
  const rawChunks = course.raw?.chunks?.length
    ? course.raw.chunks
    : createFallbackChunks(course.raw?.extractedText || '');
  const queryTokens = tokenizeForChat(question);
  const queryPhrases = extractQueryPhrases(question);

  const scoredChunks = rawChunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk.text, queryTokens, queryPhrases)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const syntheticChunks = [];

  Object.entries(course.policies || {}).forEach(([key, value]) => {
    if (value) {
      syntheticChunks.push({
        id: `chunk_policy_${key}`,
        text: `${key.replace(/_/g, ' ')}: ${value}`,
        score: scoreChunk(value, queryTokens, queryPhrases) + 3
      });
    }
  });

  (course.assignments || []).forEach((assignment) => {
    const description = [assignment.title, assignment.category, assignment.description, assignment.dueDate, assignment.dueTime]
      .filter(Boolean)
      .join(' | ');
    syntheticChunks.push({
      id: `chunk_assignment_${assignment.id || assignment.title || syntheticChunks.length}`,
      text: description,
      score: scoreChunk(description, queryTokens, queryPhrases) + 2
    });
  });

  const combined = [...scoredChunks, ...syntheticChunks]
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  return combined.filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  }).slice(0, limit);
}

function buildCourseSummary(course) {
  const assignments = [...(course.assignments || [])]
    .filter((assignment) => assignment.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 8);

  return {
    course: course.course,
    grading: course.grading,
    policies: course.policies,
    assignments: course.assignments,
    upcomingAssignments: assignments,
    sourceUrl: course.raw?.sourceUrl || course.course?.source?.url || null
  };
}

/**
 * Handle chat request
 */
async function handleChat(data) {
  const { question, courseId, history = [] } = data;
  const settings = await StorageHelper.getSettings();
  
  // Get course data
  const courses = await StorageHelper.get('syllabud_courses') || [];
  const course = courses.find(c => c.id === courseId);
  
  if (!course) {
    throw new Error('Course not found');
  }
  
  const relevantChunks = buildRelevantChunks(course, question);
  const conversationHistory = Array.isArray(history) && history.length > 0
    ? history.slice(-10)
    : (course.chatHistory || []).slice(-10);
  
  // Call backend for chat
  const response = await fetch(`${settings.backendUrl}/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'CHAT',
      payload: {
        question,
        chunks: relevantChunks,
        syllabus: buildCourseSummary(course),
        grades: course.userGrades,
        history: conversationHistory,
        rawTextExcerpt: (course.raw?.extractedText || '').slice(0, 12000)
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Chat error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.ok) {
    throw new Error(result.error?.message || 'Chat failed');
  }
  
  return { success: true, data: result.data };
}

/**
 * Check backend health
 */
async function handleCheckBackend() {
  const settings = await StorageHelper.getSettings();
  
  try {
    const response = await fetch(`${settings.backendUrl}/health`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      return { success: true, data: { healthy: false, status: response.status } };
    }
    
    const data = await response.json();
    return { success: true, data: { healthy: true, ...data } };
  } catch (error) {
    return { success: true, data: { healthy: false, error: error.message } };
  }
}

/**
 * Get settings
 */
async function handleGetSettings() {
  const settings = await StorageHelper.getSettings();
  return { success: true, data: settings };
}

/**
 * Save settings
 */
async function handleSaveSettings(newSettings) {
  const current = await StorageHelper.getSettings();
  const merged = { ...current, ...newSettings };
  await StorageHelper.set('syllabud_settings', merged);
  return { success: true, data: merged };
}

/**
 * Context menu for quick analysis
 */
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: 'analyzeSyllabus',
      title: 'Analyze Syllabus with SyllaBud',
      contexts: ['page', 'selection']
    });
  }
});

// Add context menu listener only if available
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'analyzeSyllabus') {
      // Send message to content script to trigger analysis
      chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_ANALYSIS' });
    }
  });
}

console.log('SyllaBud Service Worker initialized');
