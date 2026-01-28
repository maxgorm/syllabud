/**
 * SyllaBud Text Extraction Module
 * Extracts text from HTML, LMS pages, Google Docs, and PDFs
 * No OCR - PDFs must be text-extractable
 */

/**
 * Detect the type of page we're on
 */
function detectPageType(url) {
  const urlLower = url.toLowerCase();
  
  // Google Docs
  if (urlLower.includes('docs.google.com/document')) {
    return 'google_doc';
  }
  
  // Canvas LMS
  if (urlLower.includes('/courses/') && 
      (urlLower.includes('canvas') || urlLower.includes('instructure'))) {
    return 'lms';
  }
  
  // Blackboard
  if (urlLower.includes('blackboard')) {
    return 'lms';
  }
  
  // Moodle
  if (urlLower.includes('moodle')) {
    return 'lms';
  }
  
  // PDF (direct link or embedded)
  if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
    return 'pdf';
  }
  
  // Default to HTML
  return 'html';
}

/**
 * Extract text from HTML document
 * Preserves structure with markdown-like formatting
 */
function extractFromHTML(doc = document) {
  const extractedParts = [];
  
  // Try to get main content area first
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
    '.syllabus',
    '#syllabus',
    '.course-content'
  ];
  
  let mainContent = null;
  for (const selector of mainSelectors) {
    mainContent = doc.querySelector(selector);
    if (mainContent) break;
  }
  
  const targetElement = mainContent || doc.body;
  
  // Process the content
  const processed = processElement(targetElement);
  return cleanExtractedText(processed);
}

/**
 * Process an element and its children recursively
 */
function processElement(element, depth = 0) {
  if (!element) return '';
  
  const parts = [];
  const tagName = element.tagName?.toLowerCase();
  
  // Skip hidden elements, scripts, styles
  if (isHiddenOrIgnored(element)) {
    return '';
  }
  
  // Handle specific element types
  switch (tagName) {
    case 'h1':
      parts.push(`\n# ${getTextContent(element)}\n`);
      break;
    case 'h2':
      parts.push(`\n## ${getTextContent(element)}\n`);
      break;
    case 'h3':
      parts.push(`\n### ${getTextContent(element)}\n`);
      break;
    case 'h4':
    case 'h5':
    case 'h6':
      parts.push(`\n#### ${getTextContent(element)}\n`);
      break;
    case 'p':
      parts.push(`\n${getTextContent(element)}\n`);
      break;
    case 'li':
      parts.push(`• ${getTextContent(element)}\n`);
      break;
    case 'ul':
    case 'ol':
      parts.push('\n');
      for (const child of element.children) {
        parts.push(processElement(child, depth + 1));
      }
      parts.push('\n');
      break;
    case 'table':
      parts.push(processTable(element));
      break;
    case 'tr':
    case 'td':
    case 'th':
      // Handled by processTable
      break;
    case 'br':
      parts.push('\n');
      break;
    case 'hr':
      parts.push('\n---\n');
      break;
    case 'strong':
    case 'b':
      parts.push(`**${getTextContent(element)}**`);
      break;
    case 'em':
    case 'i':
      parts.push(`*${getTextContent(element)}*`);
      break;
    case 'a':
      const href = element.getAttribute('href');
      const text = getTextContent(element);
      if (href && text) {
        parts.push(`${text} (${href})`);
      } else {
        parts.push(text);
      }
      break;
    default:
      // For other elements, process children
      if (element.children && element.children.length > 0) {
        for (const child of element.children) {
          parts.push(processElement(child, depth + 1));
        }
      } else if (element.textContent) {
        parts.push(getTextContent(element));
      }
  }
  
  return parts.join('');
}

/**
 * Check if element should be ignored
 */
function isHiddenOrIgnored(element) {
  if (!element) return true;
  
  const tagName = element.tagName?.toLowerCase();
  const ignoredTags = ['script', 'style', 'noscript', 'svg', 'path', 'iframe', 'nav', 'header', 'footer'];
  
  if (ignoredTags.includes(tagName)) return true;
  
  // Check for hidden styles
  const style = window.getComputedStyle?.(element);
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }
  }
  
  // Check for hidden attribute
  if (element.hidden) return true;
  
  // Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') return true;
  
  return false;
}

/**
 * Get clean text content
 */
function getTextContent(element) {
  if (!element) return '';
  
  // Get only direct text, not from children (for inline elements)
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  
  // If no direct text, get all text content
  if (!text.trim()) {
    text = element.textContent || '';
  }
  
  return text.trim();
}

/**
 * Process table into readable format
 */
function processTable(table) {
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return '';
  
  const parts = ['\n'];
  
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    const cellTexts = Array.from(cells).map(cell => getTextContent(cell).trim());
    parts.push(`| ${cellTexts.join(' | ')} |\n`);
  }
  
  parts.push('\n');
  return parts.join('');
}

/**
 * Clean up extracted text
 */
function cleanExtractedText(text) {
  return text
    // Remove excessive whitespace
    .replace(/[ \t]+/g, ' ')
    // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace per line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

/**
 * Extract text from Google Docs
 * Google Docs renders to a specific structure
 */
function extractFromGoogleDoc(doc = document) {
  // Google Docs content is typically in .kix-page elements
  const pages = doc.querySelectorAll('.kix-page');
  
  if (pages.length > 0) {
    const parts = [];
    for (const page of pages) {
      parts.push(page.textContent || '');
    }
    return cleanExtractedText(parts.join('\n'));
  }
  
  // Fallback to generic extraction
  return extractFromHTML(doc);
}

/**
 * Extract text from LMS pages (Canvas, Blackboard, etc.)
 */
function extractFromLMS(doc = document) {
  // Canvas-specific selectors
  const canvasSelectors = [
    '.syllabus_content',
    '#course_syllabus',
    '.wiki-content',
    '.user_content',
    '#content'
  ];
  
  for (const selector of canvasSelectors) {
    const content = doc.querySelector(selector);
    if (content) {
      return cleanExtractedText(processElement(content));
    }
  }
  
  // Fallback to generic extraction
  return extractFromHTML(doc);
}

/**
 * Chunk text for RAG retrieval
 * ~1000-1500 chars per chunk with ~150 char overlap
 */
function chunkText(text, chunkSize = 1200, overlap = 150) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  let chunkId = 0;
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: `chunk_${chunkId}`,
        text: currentChunk.trim(),
        startIndex: text.indexOf(currentChunk.trim()),
        length: currentChunk.trim().length
      });
      chunkId++;
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ');
      const overlapWords = [];
      let overlapLength = 0;
      
      // Get last N words for overlap
      for (let i = words.length - 1; i >= 0 && overlapLength < overlap; i--) {
        overlapWords.unshift(words[i]);
        overlapLength += words[i].length + 1;
      }
      
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk_${chunkId}`,
      text: currentChunk.trim(),
      startIndex: text.indexOf(currentChunk.trim()),
      length: currentChunk.trim().length
    });
  }
  
  return chunks;
}

/**
 * Main extraction function - detects type and extracts accordingly
 */
async function extractText(url = window.location.href, doc = document) {
  const pageType = detectPageType(url);
  let extractedText = '';
  
  switch (pageType) {
    case 'google_doc':
      extractedText = extractFromGoogleDoc(doc);
      break;
    case 'lms':
      extractedText = extractFromLMS(doc);
      break;
    case 'pdf':
      // PDF extraction is handled separately via PDF.js
      throw new Error('PDF_REQUIRES_SPECIAL_HANDLING');
    case 'html':
    default:
      extractedText = extractFromHTML(doc);
  }
  
  // Create chunks for retrieval
  const chunks = chunkText(extractedText);
  
  return {
    pageType,
    url,
    extractedText,
    chunks,
    extractedAt: Date.now(),
    charCount: extractedText.length
  };
}

/**
 * Validate extraction result
 */
function validateExtraction(result) {
  const MIN_CHARS = 100;
  const warnings = [];
  
  if (!result.extractedText || result.extractedText.length < MIN_CHARS) {
    warnings.push('Extracted text seems too short. The page may not contain a syllabus.');
  }
  
  // Check for common syllabus indicators
  const syllabusIndicators = [
    'syllabus', 'course', 'grade', 'assignment', 'exam', 
    'policy', 'attendance', 'instructor', 'office hours'
  ];
  
  const textLower = result.extractedText.toLowerCase();
  const foundIndicators = syllabusIndicators.filter(ind => textLower.includes(ind));
  
  if (foundIndicators.length < 2) {
    warnings.push('This page may not be a syllabus. Few syllabus-related terms were found.');
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    indicatorsFound: foundIndicators
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectPageType,
    extractFromHTML,
    extractFromGoogleDoc,
    extractFromLMS,
    chunkText,
    extractText,
    validateExtraction,
    cleanExtractedText
  };
}

export {
  detectPageType,
  extractFromHTML,
  extractFromGoogleDoc,
  extractFromLMS,
  chunkText,
  extractText,
  validateExtraction,
  cleanExtractedText
};
