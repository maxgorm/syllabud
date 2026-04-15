/**
 * SyllaBud Content Script
 * Injects floating "Analyze Syllabus" button and handles page interactions
 */

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.syllaBudInjected) return;
  window.syllaBudInjected = true;
  
  // State
  let isAnalyzing = false;
  let floatingButton = null;
  let toastContainer = null;
  
  /**
   * Check if extension context is still valid
   */
  function isExtensionContextValid() {
    try {
      // This will throw if context is invalidated
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Safe wrapper for chrome.runtime.sendMessage
   */
  async function safeSendMessage(message) {
    if (!isExtensionContextValid()) {
      throw new Error('Extension was updated or reloaded. Please refresh this page.');
    }
    
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Extension communication error'));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        reject(new Error('Extension was updated or reloaded. Please refresh this page.'));
      }
    });
  }
  
  /**
   * Detect if current page is likely a syllabus
   */
  function isSyllabusLikelySite() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    
    // Check for PDF
    if (url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('/pdf/') || 
        document.contentType === 'application/pdf' ||
        document.querySelector('embed[type="application/pdf"]')) {
      return { likely: true, reason: 'pdf' };
    }
    
    // Check for LMS platforms
    const lmsPatterns = [
      'canvas', 'instructure', 'blackboard', 'moodle', 'brightspace', 
      'd2l', 'schoology', 'sakai', 'coursera', 'edx', 'udemy',
      'gradescope', 'piazza', 'elearning', 'lms', 'coursesite'
    ];
    
    for (const pattern of lmsPatterns) {
      if (hostname.includes(pattern) || url.includes(pattern)) {
        return { likely: true, reason: 'lms' };
      }
    }
    
    // Check for educational domains
    if (hostname.endsWith('.edu') || hostname.endsWith('.edu.au') || 
        hostname.endsWith('.ac.uk') || hostname.endsWith('.edu.cn') ||
        hostname.includes('university') || hostname.includes('college')) {
      return { likely: true, reason: 'edu' };
    }
    
    // Check for .org sites (some educational content)
    if (hostname.endsWith('.org') && !hostname.includes('google') && !hostname.includes('mozilla')) {
      // Only show if page has syllabus-like content
      if (detectSyllabusContent()) {
        return { likely: true, reason: 'org_with_content' };
      }
    }
    
    // Check URL path for syllabus indicators
    const syllabusPathPatterns = [
      '/syllabus', '/course', '/class', '/schedule', '/assignments',
      'syllabus', 'course_syllabus', 'class_syllabus'
    ];
    
    for (const pattern of syllabusPathPatterns) {
      if (url.includes(pattern)) {
        return { likely: true, reason: 'syllabus_url' };
      }
    }
    
    // Check page content for syllabus indicators (heavier check, do last)
    if (detectSyllabusContent()) {
      return { likely: true, reason: 'content' };
    }
    
    return { likely: false, reason: 'none' };
  }
  
  /**
   * Check if page content looks like a syllabus
   */
  function detectSyllabusContent() {
    try {
      const text = (document.body?.innerText || '').toLowerCase().substring(0, 10000);
      
      // Strong indicators (need 2+)
      const strongIndicators = ['syllabus', 'grading policy', 'course objectives', 'learning outcomes', 'office hours'];
      const strongMatches = strongIndicators.filter(ind => text.includes(ind)).length;
      
      if (strongMatches >= 1) return true;
      
      // Moderate indicators (need 3+)
      const moderateIndicators = [
        'instructor', 'professor', 'assignment', 'exam', 'midterm', 'final',
        'grading', 'attendance', 'textbook', 'prerequisite', 'credit hour',
        'course description', 'learning objective', 'academic integrity', 'late policy'
      ];
      const moderateMatches = moderateIndicators.filter(ind => text.includes(ind)).length;
      
      return moderateMatches >= 3;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Create and inject the floating button
   */
  function createFloatingButton() {
    if (floatingButton) return;
    
    floatingButton = document.createElement('div');
    floatingButton.id = 'syllabud-floating-btn';
    floatingButton.innerHTML = `
      <button id="syllabud-analyze-btn" title="Analyze Syllabus with SyllaBud">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          <line x1="8" y1="7" x2="16" y2="7"></line>
          <line x1="8" y1="11" x2="16" y2="11"></line>
          <line x1="8" y1="15" x2="12" y2="15"></line>
        </svg>
        <span>Analyze Syllabus</span>
      </button>
      <div id="syllabud-progress" style="display: none;">
        <div class="syllabud-spinner"></div>
        <span>Analyzing...</span>
      </div>
    `;
    
    document.body.appendChild(floatingButton);
    
    // Add click handler
    const btn = document.getElementById('syllabud-analyze-btn');
    btn.addEventListener('click', handleAnalyzeClick);
    
    // Make draggable
    makeDraggable(floatingButton);
  }
  
  /**
   * Create toast notification container
   */
  function createToastContainer() {
    if (toastContainer) return;
    
    toastContainer = document.createElement('div');
    toastContainer.id = 'syllabud-toasts';
    document.body.appendChild(toastContainer);
  }
  
  /**
   * Show toast notification
   */
  function showToast(message, type = 'info', duration = 4000) {
    createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `syllabud-toast syllabud-toast-${type}`;
    toast.innerHTML = `
      <span class="syllabud-toast-icon">${getToastIcon(type)}</span>
      <span class="syllabud-toast-message">${message}</span>
      <button class="syllabud-toast-close">&times;</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Close button
    toast.querySelector('.syllabud-toast-close').addEventListener('click', () => {
      removeToast(toast);
    });
    
    // Auto remove
    if (duration > 0) {
      setTimeout(() => removeToast(toast), duration);
    }
    
    return toast;
  }
  
  /**
   * Get icon for toast type
   */
  function getToastIcon(type) {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  }
  
  /**
   * Remove toast with animation
   */
  function removeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }
  
  /**
   * Show/hide progress indicator
   */
  function setProgress(show, message = 'Analyzing...') {
    const btn = document.getElementById('syllabud-analyze-btn');
    const progress = document.getElementById('syllabud-progress');
    
    if (show) {
      btn.style.display = 'none';
      progress.style.display = 'flex';
      progress.querySelector('span').textContent = message;
    } else {
      btn.style.display = 'flex';
      progress.style.display = 'none';
    }
    
    isAnalyzing = show;
  }
  
  /**
   * Handle analyze button click
   */
  async function handleAnalyzeClick() {
    if (isAnalyzing) return;
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      showToast('Extension was updated. Please refresh this page to continue.', 'error', 8000);
      return;
    }
    
    try {
      setProgress(true, 'Extracting text...');
      
      // Extract text from page
      const extraction = await safeSendMessage({
        action: 'EXTRACT_TEXT'
      });
      
      if (!extraction.success) {
        throw new Error(extraction.error || 'Failed to extract text');
      }
      
      const { extractedText, chunks, pageType, url, error: extractError } = extraction.data;
      
      // Handle PDF native viewer case
      if (extractError === 'PDF_NATIVE_VIEWER') {
        showToast('Cannot read PDF directly. Please copy the text from the PDF and use the paste option in the extension popup.', 'warning', 8000);
        setProgress(false);
        return;
      }
      
      // Validate extraction
      if (!extractedText || extractedText.length < 100) {
        showToast('This page doesn\'t appear to contain enough text. Try a different page or paste the syllabus manually.', 'warning', 6000);
        setProgress(false);
        return;
      }
      
      setProgress(true, 'Analyzing syllabus...');
      
      // Send to backend for analysis
      const analysis = await safeSendMessage({
        action: 'ANALYZE_SYLLABUS',
        data: { extractedText, url }
      });
      
      if (!analysis.success) {
        throw new Error(analysis.error || 'Analysis failed');
      }
      
      setProgress(true, 'Saving course...');
      
      // Create course object
      const courseData = {
        id: `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...analysis.data,
        raw: {
          extractedText,
          chunks,
          sourceUrl: url
        },
        userGrades: {},
        chatHistory: [],
        settings: {
          treatUnfilledAs: 100,
          ics: { defaultReminderMinutes: 1440 }
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      // Update source info
      courseData.course = courseData.course || {};
      courseData.course.source = { url, type: pageType };
      
      // Save course
      await safeSendMessage({
        action: 'SAVE_COURSE',
        data: courseData
      });
      
      setProgress(false);
      showToast(`Successfully analyzed: ${courseData.course?.title || 'Course'}`, 'success');
      
      // Open popup to show results
      // Note: Can't programmatically open popup, but can badge the icon
      safeSendMessage({ action: 'BADGE_NEW' }).catch(() => {});
      
    } catch (error) {
      console.error('SyllaBud analysis error:', error);
      setProgress(false);
      
      // Provide helpful error message
      const errorMsg = error.message || 'Analysis failed. Please try again.';
      if (errorMsg.includes('refresh')) {
        showToast(errorMsg, 'error', 0); // Don't auto-dismiss
      } else {
        showToast(errorMsg, 'error', 6000);
      }
    }
  }
  
  /**
   * Make element draggable
   */
  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    element.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      
      element.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      const newX = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, initialX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, initialY + dy));
      
      element.style.left = newX + 'px';
      element.style.top = newY + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
      element.style.cursor = 'grab';
    });
  }
  
  /**
   * Listen for messages from background/popup
   */
  function setupMessageListener() {
    if (!isExtensionContextValid()) return;
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'TRIGGER_ANALYSIS') {
          handleAnalyzeClick();
          sendResponse({ received: true });
        }
        return true;
      });
    } catch (e) {
      console.log('SyllaBud: Could not set up message listener');
    }
  }
  
  /**
   * Check if page looks like a syllabus (legacy, for content detection)
   */
  function detectSyllabusPage() {
    return detectSyllabusContent();
  }
  
  /**
   * Initialize
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }
  
  function setup() {
    // Check if this page is likely a syllabus site
    const detection = isSyllabusLikelySite();
    
    if (!detection.likely) {
      // Don't inject anything on non-syllabus sites
      console.log('SyllaBud: Page does not appear to be syllabus-related, not injecting button');
      return;
    }
    
    console.log('SyllaBud: Detected syllabus-like page, reason:', detection.reason);
    
    createFloatingButton();
    createToastContainer();
    setupMessageListener();
    
    // Add detected class for styling
    floatingButton.classList.add('syllabud-detected');
    floatingButton.dataset.reason = detection.reason;
    
    // If it's a PDF in native viewer, show a helpful tip
    if (detection.reason === 'pdf' && document.querySelector('embed[type="application/pdf"]')) {
      setTimeout(() => {
        showToast('PDF detected. Click "Analyze Syllabus" or copy text and use paste option in extension popup.', 'info', 8000);
      }, 1500);
    }
  }
  
  // Start
  init();
  
})();
