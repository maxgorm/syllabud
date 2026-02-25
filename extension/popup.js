/**
 * SyllaBud Popup Script
 * Main UI controller for the extension popup
 */

// State
let currentCourse = null;
let allCourses = [];
let settings = {};
let chatHistory = [];

// DOM Elements
const elements = {};

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  setupEventListeners();
  await loadSettings();
  await loadAllCourses();
  await initializeView();
});

/**
 * Cache DOM elements for performance
 */
function cacheElements() {
  elements.loading = document.getElementById('loading');
  elements.dashboard = document.getElementById('dashboard');
  elements.courseView = document.getElementById('course-view');
  elements.courseTitle = document.getElementById('course-title');
  elements.courseTerm = document.getElementById('course-term');
  elements.currentGrade = document.getElementById('current-grade');
  elements.letterGrade = document.getElementById('letter-grade');
  elements.gradeBreakdown = document.getElementById('grade-breakdown');
  elements.upcomingList = document.getElementById('upcoming-list');
  elements.gradesContainer = document.getElementById('grades-container');
  elements.dueDatesList = document.getElementById('due-dates-list');
  elements.policiesContainer = document.getElementById('policies-container');
  elements.chatMessages = document.getElementById('chat-messages');
  elements.chatInput = document.getElementById('chat-input');
  elements.settingsPanel = document.getElementById('settings-panel');
  elements.pasteText = document.getElementById('paste-text');
  elements.neededGrade = document.getElementById('needed-grade');
  elements.dashboardCourseList = document.getElementById('dashboard-course-list');
  elements.courseCount = document.getElementById('course-count');
  elements.analyzingModal = document.getElementById('analyzing-modal');
  elements.analyzingStatus = document.getElementById('analyzing-status');
  elements.fileUpload = document.getElementById('fileUpload');
}


/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });


  // Dashboard buttons
  document.getElementById('btn-analyze-page')?.addEventListener('click', analyzeCurrentPage);
  document.getElementById('btn-analyze-paste')?.addEventListener('click', analyzePastedText);


  // Open file picker when clicked
  document.getElementById('btn-analyze-file')?.addEventListener('click', () => {
    elements.fileUpload.click(); // open file picker
  });

  elements.fileUpload?.addEventListener('change', analyzeUploadedFile);
  
  // Course view buttons
  document.getElementById('btn-back-home')?.addEventListener('click', showDashboard);
  document.getElementById('btn-analyze-page-course')?.addEventListener('click', analyzeCurrentPage);
  document.getElementById('btn-reanalyze')?.addEventListener('click', reanalyzeSyllabus);
  document.getElementById('btn-export-ics')?.addEventListener('click', exportICS);
  document.getElementById('btn-reset-grades')?.addEventListener('click', resetGrades);
  document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
  
  // Settings
  document.getElementById('btn-settings')?.addEventListener('click', showSettings);
  document.getElementById('close-settings')?.addEventListener('click', hideSettings);
  document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);



  // Chat input
  elements.chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Quick questions
  document.querySelectorAll('.quick-q').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.chatInput.value = btn.textContent;
      sendChatMessage();
    });
  });

  // What-if mode toggle
  document.getElementById('what-if-mode')?.addEventListener('change', (e) => {
    document.body.classList.toggle('what-if-active', e.target.checked);
    updateGradeDisplay();
  });

  // Target grade
  document.getElementById('target-grade')?.addEventListener('change', updateNeededGrade);

  // Due dates filter
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterDueDates(btn.dataset.filter);
    });
  });
}

/**
 * Load settings
 */
async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
  if (response.success) {
    settings = response.data;
    document.getElementById('setting-unfilled').value = settings.treatUnfilledAs || 100;
    document.getElementById('setting-reminder').value = settings.ics?.defaultReminderMinutes || 1440;
    document.getElementById('setting-backend').value = settings.backendUrl || 'http://localhost:3000';
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  const newSettings = {
    treatUnfilledAs: parseInt(document.getElementById('setting-unfilled').value) || 100,
    ics: {
      defaultReminderMinutes: parseInt(document.getElementById('setting-reminder').value) || 1440
    },
    backendUrl: document.getElementById('setting-backend').value || 'http://localhost:3000'
  };

  const response = await chrome.runtime.sendMessage({
    action: 'SAVE_SETTINGS',
    data: newSettings
  });

  if (response.success) {
    settings = response.data;
    hideSettings();
    updateGradeDisplay();
  }
}

/**
 * Load all courses
 */
async function loadAllCourses() {
  const response = await chrome.runtime.sendMessage({ action: 'GET_ALL_COURSES' });
  if (response.success) {
    allCourses = response.data || [];
  }
}

/**
 * Initialize view - show dashboard or course based on state
 */
async function initializeView() {
  elements.loading.style.display = 'none';
  
  // Always show dashboard first
  showDashboard();
}

/**
 * Show dashboard
 */
function showDashboard() {
  elements.dashboard.style.display = 'flex';
  elements.courseView.style.display = 'none';
  renderDashboardCourses();
}

/**
 * Render dashboard course list
 */
function renderDashboardCourses() {
  elements.courseCount.textContent = allCourses.length;
  
  if (allCourses.length === 0) {
    elements.dashboardCourseList.innerHTML = `
      <div class="empty-courses">
        <p>No courses yet</p>
        <p class="hint">Analyze a syllabus to get started!</p>
      </div>
    `;
    return;
  }

  const html = allCourses.map(course => {
    const grade = calculateCourseGrade(course);
    const gradeDisplay = grade.grade !== null ? `${grade.grade.toFixed(0)}%` : '--';
    const letterDisplay = grade.letterGrade || '';
    
    return `
      <div class="dashboard-course-card" data-id="${course.id}">
        <div class="course-card-main">
          <div class="course-card-icon">📚</div>
          <div class="course-card-info">
            <div class="course-card-title">${course.course?.title || 'Untitled Course'}</div>
            <div class="course-card-meta">${course.course?.term || ''} • ${course.course?.instructor || 'Unknown Instructor'}</div>
          </div>
          <div class="course-card-grade">
            <span class="grade-percent">${gradeDisplay}</span>
            <span class="grade-letter">${letterDisplay}</span>
          </div>
        </div>
        <div class="course-card-actions">
          <button class="btn btn-sm btn-view" data-id="${course.id}">View</button>
          <button class="btn btn-sm btn-ghost btn-delete" data-id="${course.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  elements.dashboardCourseList.innerHTML = html;

  // Add event listeners
  elements.dashboardCourseList.querySelectorAll('.course-card-main').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.parentElement.dataset.id;
      openCourse(id);
    });
  });

  elements.dashboardCourseList.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCourse(btn.dataset.id);
    });
  });

  elements.dashboardCourseList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCourse(btn.dataset.id);
    });
  });
}

/**
 * Calculate course grade (simplified)
 */
function calculateCourseGrade(course) {
  const grading = course.grading || {};
  const userGrades = course.userGrades || {};
  const treatUnfilledAs = settings.treatUnfilledAs || 100;

  if (grading.schemeType === 'weighted' && grading.categories?.length > 0) {
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const cat of grading.categories) {
      const assignments = cat.assignments || [];
      const categoryId = cat.id || cat.name;
      let catAvg = null;

      if (assignments.length === 0) {
        // No assignments - check for direct category grade
        const directGrade = userGrades[categoryId];
        if (directGrade !== undefined && directGrade !== null && directGrade !== '') {
          catAvg = parseFloat(directGrade);
        } else {
          catAvg = treatUnfilledAs;
        }
      } else {
        // Has assignments - calculate average
        let catTotal = 0;
        let catCount = 0;

        for (const a of assignments) {
          const id = a.id || a.title;
          const grade = userGrades[id];
          
          let gradeValue;
          if (grade !== undefined && grade !== null && grade !== '') {
            gradeValue = parseFloat(grade);
            
            // Convert to percentage if points-based
            if (a.pointsPossible && a.pointsPossible > 0) {
              gradeValue = (gradeValue / a.pointsPossible) * 100;
            }
          } else {
            gradeValue = treatUnfilledAs;
          }
          
          catTotal += gradeValue;
          catCount++;
        }

        if (catCount > 0) {
          catAvg = catTotal / catCount;
        }
      }

      if (catAvg !== null) {
        const weight = parseFloat(cat.weight) || 0;
        totalWeight += weight;
        earnedWeight += (catAvg / 100) * weight;
      }
    }

    if (totalWeight > 0) {
      const grade = (earnedWeight / totalWeight) * 100;
      return { grade, letterGrade: getLetterGrade(grade) };
    }
  }

  return { grade: null, letterGrade: null };
}

/**
 * Open a course
 */
async function openCourse(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;

  currentCourse = course;
  
  // Set as active course
  await chrome.runtime.sendMessage({
    action: 'SAVE_COURSE',
    data: course
  });

  showCourseView();
}

/**
 * Delete a course
 */
async function deleteCourse(courseId) {
  if (!confirm('Delete this course? This cannot be undone.')) return;

  await chrome.runtime.sendMessage({
    action: 'DELETE_COURSE',
    data: { courseId }
  });

  // Refresh course list
  await loadAllCourses();
  
  if (currentCourse?.id === courseId) {
    currentCourse = null;
  }
  
  renderDashboardCourses();
}

/**
 * Show course view
 */
function showCourseView() {
  elements.dashboard.style.display = 'none';
  elements.courseView.style.display = 'flex';
  renderCourse();
}

/**
 * Render course data
 */
function renderCourse() {
  if (!currentCourse) return;

  // Header
  elements.courseTitle.textContent = currentCourse.course?.title || 'Untitled Course';
  elements.courseTerm.textContent = currentCourse.course?.term || '';

  // Info
  document.getElementById('info-instructor').textContent = currentCourse.course?.instructor || '-';
  document.getElementById('info-institution').textContent = currentCourse.course?.institution || '-';
  document.getElementById('info-term').textContent = currentCourse.course?.term || '-';
  document.getElementById('info-grading-type').textContent = currentCourse.grading?.schemeType || 'Unknown';

  // Update all sections
  updateGradeDisplay();
  renderGradeBreakdown();
  renderUpcoming();
  renderGradesTab();
  renderDueDates();
  renderPolicies();
}

/**
 * Update grade display
 */
function updateGradeDisplay() {
  if (!currentCourse) return;

  const result = calculateCourseGrade(currentCourse);
  
  if (result.grade !== null) {
    elements.currentGrade.textContent = result.grade.toFixed(1) + '%';
    elements.letterGrade.textContent = result.letterGrade || '-';
  } else {
    elements.currentGrade.textContent = '--';
    elements.letterGrade.textContent = '-';
  }

  updateNeededGrade();
}

/**
 * Get letter grade
 */
function getLetterGrade(percentage) {
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

/**
 * Analyze current page
 */
async function analyzeCurrentPage() {
  showAnalyzingModal('Extracting text from page...');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Extract text from page
    updateAnalyzingStatus('Extracting text from page...');
    const extractResult = await chrome.runtime.sendMessage({
      action: 'EXTRACT_TEXT',
      data: { tabId: tab.id }
    });

    if (!extractResult.success) {
      throw new Error(extractResult.error || 'Failed to extract text');
    }

    const { extractedText, chunks, url, error: extractError } = extractResult.data;

    // Handle PDF native viewer case
    if (extractError === 'PDF_NATIVE_VIEWER') {
      throw new Error('Cannot extract text from this PDF directly. Please either:\n\n1. Copy the PDF text and paste it in the "paste manually" section\n2. Open the PDF in a different viewer\n3. Try the PDF on a webpage that displays its content');
    }

    if (!extractedText || extractedText.length < 100) {
      throw new Error('Not enough text found on this page. Try a different page or paste the syllabus manually.');
    }

    // Analyze with AI
    updateAnalyzingStatus('Analyzing syllabus with AI...');
    const analyzeResult = await chrome.runtime.sendMessage({
      action: 'ANALYZE_SYLLABUS',
      data: { extractedText, url }
    });

    if (!analyzeResult.success) {
      throw new Error(analyzeResult.error || 'Analysis failed');
    }

    // Create course object
    updateAnalyzingStatus('Saving course data...');
    const courseData = {
      id: `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...analyzeResult.data,
      raw: {
        extractedText,
        chunks: chunks || [],
        sourceUrl: url
      },
      userGrades: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Save course
    await chrome.runtime.sendMessage({
      action: 'SAVE_COURSE',
      data: courseData
    });

    // Refresh courses and open the new one
    await loadAllCourses();
    currentCourse = courseData;
    
    hideAnalyzingModal();
    showCourseView();

  } catch (error) {
    hideAnalyzingModal();
    alert('Analysis failed: ' + error.message);
  }
}

/**
 * Show analyzing modal
 */
function showAnalyzingModal(status) {
  elements.analyzingStatus.textContent = status || 'Analyzing...';
  elements.analyzingModal.style.display = 'flex';
}

/**
 * Update analyzing status
 */
function updateAnalyzingStatus(status) {
  elements.analyzingStatus.textContent = status;
}

/**
 * Hide analyzing modal
 */
function hideAnalyzingModal() {
  elements.analyzingModal.style.display = 'none';
}

/**
 * Analyze pasted text
 */
async function analyzePastedText() {
  const text = elements.pasteText?.value.trim();
  
  if (!text || text.length < 100) {
    alert('Please paste more syllabus text (at least 100 characters)');
    return;
  }

  showAnalyzingModal('Analyzing pasted text...');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'ANALYZE_SYLLABUS',
      data: {
        extractedText: text,
        url: 'pasted-text'
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Analysis failed');
    }

    // Create course
    const courseData = {
      id: `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...response.data,
      raw: {
        extractedText: text,
        chunks: [],
        sourceUrl: 'pasted-text'
      },
      userGrades: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Save
    await chrome.runtime.sendMessage({
      action: 'SAVE_COURSE',
      data: courseData
    });

    await loadAllCourses();
    currentCourse = courseData;
    
    hideAnalyzingModal();
    showCourseView();

  } catch (error) {
    hideAnalyzingModal();
    alert('Analysis failed: ' + error.message);
  }
}

/**
 * Analyze uploaded file -- Nick 2/25
 */
async function analyzeUploadedFile() {
  const file = elements.fileUpload.files[0];
  if (!file) return;

  try {
    showAnalyzingModal('Reading file...');

    const extractedText = await extractTextFromUploadedFile(file);

    if (!extractedText || extractedText.length < 100) {
      throw new Error('Not enough text found in file');
    }

    updateAnalyzingStatus('Analyzing syllabus with AI...');

    const analyzeResult = await chrome.runtime.sendMessage({
      action: 'ANALYZE_SYLLABUS',
      data: {
        extractedText,
        url: file.name
      }
    });

    if (!analyzeResult.success) {
      throw new Error(analyzeResult.error || 'Analysis failed');
    }

    updateAnalyzingStatus('Saving course data...');

    const courseData = {
      id: `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...analyzeResult.data,
      raw: {
        extractedText,
        chunks: [],
        sourceUrl: file.name
      },
      userGrades: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await chrome.runtime.sendMessage({
      action: 'SAVE_COURSE',
      data: courseData
    });

    await loadAllCourses();
    currentCourse = courseData;

    hideAnalyzingModal();
    showCourseView();

  } catch (error) {
    hideAnalyzingModal();
    alert('File analysis failed: ' + error.message);
  } finally {
    elements.fileUpload.value = ''; // reset input
  }
}



/**
 * Extract text from uploaded file -- Nick 2/25
 */
async function extractTextFromUploadedFile(file) {
  const name = file.name.toLowerCase();

  // TXT files
  if (name.endsWith('.txt')) {
    return file.text();
  }

  // DOCX / PDF placeholder (temporary simple read)
  // Replace later with real parser (pdf.js / mammoth)
  if (name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc')) {
    const buffer = await file.arrayBuffer();

    // naive text decode (works for some files, not all)
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }

  throw new Error('Unsupported file type');
}


/**
 * Re-analyze syllabus
 */
async function reanalyzeSyllabus() {
  if (!confirm('Re-analyze will fetch fresh data from the current page. Continue?')) return;
  await analyzeCurrentPage();
}

/**
 * Render grade breakdown
 */
function renderGradeBreakdown() {
  if (!currentCourse?.grading?.categories) {
    elements.gradeBreakdown.innerHTML = '<p class="empty-text">No grading categories found</p>';
    return;
  }

  const html = currentCourse.grading.categories.map(cat => {
    const weight = parseFloat(cat.weight) || 0;
    return `
      <div class="grade-category">
        <span class="category-name">${cat.name || 'Unnamed'}</span>
        <span class="category-weight">${weight}%</span>
        <div class="category-bar">
          <div class="category-fill" style="width: ${weight}%"></div>
        </div>
      </div>
    `;
  }).join('');

  elements.gradeBreakdown.innerHTML = html;
}

/**
 * Render upcoming assignments
 */
function renderUpcoming() {
  const assignments = currentCourse?.assignments || [];
  const now = new Date();
  
  const upcoming = assignments
    .filter(a => a.dueDate && new Date(a.dueDate) > now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 3);

  if (upcoming.length === 0) {
    elements.upcomingList.innerHTML = '<p class="empty-text">No upcoming assignments</p>';
    return;
  }

  const html = upcoming.map(a => {
    const date = new Date(a.dueDate);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    
    return `
      <div class="upcoming-item">
        <div class="upcoming-date">
          <span class="day">${day}</span>
          <span class="month">${month}</span>
        </div>
        <div class="upcoming-info">
          <div class="upcoming-title">${a.title || 'Untitled'}</div>
          <div class="upcoming-category">${a.category || ''}</div>
        </div>
      </div>
    `;
  }).join('');

  elements.upcomingList.innerHTML = html;
}

/**
 * Render grades tab
 */
function renderGradesTab() {
  const categories = currentCourse?.grading?.categories || [];
  
  if (categories.length === 0) {
    elements.gradesContainer.innerHTML = '<p class="empty-text">No grading categories found</p>';
    return;
  }

  const html = categories.map(cat => {
    const assignments = cat.assignments || [];
    const categoryId = cat.id || cat.name;
    
    let contentHtml = '';
    
    if (assignments.length === 0) {
      // No assignments - show a single category-level grade input
      const value = currentCourse.userGrades?.[categoryId] || '';
      contentHtml = `
        <div class="grade-item">
          <span class="grade-item-name">Overall ${cat.name} Grade</span>
          <input type="number" 
                 class="grade-item-input" 
                 data-id="${categoryId}" 
                 value="${value}" 
                 placeholder="--"
                 min="0" 
                 max="100"
                 step="0.1">
          <span class="grade-item-max">%</span>
        </div>
      `;
    } else {
      // Has assignments - show each assignment
      contentHtml = assignments.map(a => {
        const id = a.id || a.title;
        const value = currentCourse.userGrades?.[id] || '';
        const maxPoints = a.pointsPossible ? ` / ${a.pointsPossible}` : '%';
        
        return `
          <div class="grade-item">
            <span class="grade-item-name">${a.title || 'Untitled'}</span>
            <input type="number" 
                   class="grade-item-input" 
                   data-id="${id}" 
                   value="${value}" 
                   placeholder="--"
                   min="0" 
                   ${a.pointsPossible ? `max="${a.pointsPossible}"` : 'max="100"'}
                   step="0.1">
            <span class="grade-item-max">${maxPoints}</span>
          </div>
        `;
      }).join('');
    }
    
    // Calculate category average for display
    const catGrade = calculateCategoryAverage(cat, currentCourse.userGrades || {});
    const catGradeDisplay = catGrade !== null ? catGrade.toFixed(1) + '%' : '--';

    return `
      <div class="grade-category-section expanded">
        <div class="grade-category-header">
          <h4>${cat.name || 'Unnamed'} (${cat.weight || 0}%)</h4>
          <span class="category-grade">${catGradeDisplay}</span>
        </div>
        <div class="grade-items">
          ${contentHtml}
        </div>
      </div>
    `;
  }).join('');

  elements.gradesContainer.innerHTML = html;

  // Add input listeners
  elements.gradesContainer.querySelectorAll('.grade-item-input').forEach(input => {
    input.addEventListener('change', handleGradeInput);
  });
}

/**
 * Calculate category average from user grades
 */
function calculateCategoryAverage(category, userGrades) {
  const assignments = category.assignments || [];
  const categoryId = category.id || category.name;
  const treatUnfilledAs = settings.treatUnfilledAs || 100;
  
  // If no assignments, check for direct category grade
  if (assignments.length === 0) {
    const directGrade = userGrades[categoryId];
    if (directGrade !== undefined && directGrade !== null && directGrade !== '') {
      return parseFloat(directGrade);
    }
    return null; // No grade entered yet
  }
  
  // Calculate average from assignments
  let total = 0;
  let count = 0;
  let hasAnyGrade = false;
  
  for (const assignment of assignments) {
    const id = assignment.id || assignment.title;
    const grade = userGrades[id];
    
    if (grade !== undefined && grade !== null && grade !== '') {
      hasAnyGrade = true;
      let gradeValue = parseFloat(grade);
      
      // Convert to percentage if points-based
      if (assignment.pointsPossible && assignment.pointsPossible > 0) {
        gradeValue = (gradeValue / assignment.pointsPossible) * 100;
      }
      
      total += gradeValue;
      count++;
    } else {
      // Use treatUnfilledAs for empty grades
      total += treatUnfilledAs;
      count++;
    }
  }
  
  return count > 0 ? total / count : null;
}

/**
 * Handle grade input
 */
async function handleGradeInput(e) {
  const input = e.target;
  const id = input.dataset.id;
  const value = input.value;

  if (!currentCourse) return;

  currentCourse.userGrades = currentCourse.userGrades || {};
  
  if (value === '' || value === null) {
    delete currentCourse.userGrades[id];
  } else {
    currentCourse.userGrades[id] = parseFloat(value);
  }

  // Save to storage
  await chrome.runtime.sendMessage({
    action: 'UPDATE_GRADES',
    data: {
      courseId: currentCourse.id,
      grades: { [id]: value === '' ? null : parseFloat(value) }
    }
  });

  // Update grade display and re-render to show updated category averages
  updateGradeDisplay();
  
  // Update just the category grade displays without full re-render
  const categories = currentCourse?.grading?.categories || [];
  categories.forEach((cat, index) => {
    const catGrade = calculateCategoryAverage(cat, currentCourse.userGrades || {});
    const catGradeDisplay = catGrade !== null ? catGrade.toFixed(1) + '%' : '--';
    const categoryHeaders = elements.gradesContainer.querySelectorAll('.category-grade');
    if (categoryHeaders[index]) {
      categoryHeaders[index].textContent = catGradeDisplay;
    }
  });
}

/**
 * Reset all grades
 */
async function resetGrades() {
  if (!currentCourse || !confirm('Reset all entered grades?')) return;

  currentCourse.userGrades = {};
  
  await chrome.runtime.sendMessage({
    action: 'SAVE_COURSE',
    data: currentCourse
  });

  renderGradesTab();
  updateGradeDisplay();
}

/**
 * Update needed grade display
 */
function updateNeededGrade() {
  const target = parseInt(document.getElementById('target-grade')?.value) || 90;
  
  if (!currentCourse) {
    elements.neededGrade.textContent = '';
    return;
  }

  const current = calculateCourseGrade(currentCourse);
  if (current.grade !== null) {
    if (current.grade >= target) {
      elements.neededGrade.textContent = `✓ Already at ${current.grade.toFixed(1)}%`;
    } else {
      elements.neededGrade.textContent = `Need ~${(target + 5).toFixed(0)}% average on remaining`;
    }
  }
}

/**
 * Render due dates
 */
function renderDueDates() {
  const assignments = currentCourse?.assignments || [];
  
  if (assignments.length === 0) {
    elements.dueDatesList.innerHTML = '<p class="empty-text">No assignments found</p>';
    return;
  }

  const now = new Date();
  const sorted = [...assignments].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  const html = sorted.map(a => {
    const hasDue = !!a.dueDate;
    const date = hasDue ? new Date(a.dueDate) : null;
    const isPast = date && date < now;
    const isSoon = date && !isPast && (date - now) < 7 * 24 * 60 * 60 * 1000;
    
    let markerClass = '';
    if (!hasDue) markerClass = 'tbd';
    else if (isPast) markerClass = 'past';
    else if (isSoon) markerClass = 'soon';

    const dateStr = date ? date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }) : 'TBD';
    
    const timeStr = date && a.dueTime ? date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }) : '';

    return `
      <div class="due-date-item" data-status="${isPast ? 'past' : (!hasDue ? 'tbd' : 'upcoming')}">
        <div class="due-date-marker ${markerClass}"></div>
        <div class="due-date-info">
          <div class="due-date-title">${a.title || 'Untitled'}</div>
          <div class="due-date-meta">${a.category || ''}</div>
        </div>
        <div class="due-date-date">
          <div class="due-date-day">${dateStr}</div>
          <div class="due-date-time">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');

  elements.dueDatesList.innerHTML = html;
}

/**
 * Filter due dates
 */
function filterDueDates(filter) {
  const items = elements.dueDatesList.querySelectorAll('.due-date-item');
  
  items.forEach(item => {
    const status = item.dataset.status;
    
    if (filter === 'all') {
      item.style.display = 'flex';
    } else if (filter === status) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * Render policies
 */
function renderPolicies() {
  const policies = currentCourse?.policies || {};
  const policyKeys = Object.keys(policies).filter(k => policies[k]);
  
  if (policyKeys.length === 0) {
    elements.policiesContainer.innerHTML = '<p class="empty-text">No policies extracted</p>';
    return;
  }

  const html = policyKeys.map(key => {
    const value = policies[key];
    const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return `
      <div class="policy-card expanded">
        <div class="policy-header">
          <h4>${displayKey}</h4>
        </div>
        <div class="policy-content">${value || 'No details available'}</div>
      </div>
    `;
  }).join('');

  elements.policiesContainer.innerHTML = html;
}

/**
 * Switch tab
 */
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  
  document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
}

/**
 * Send chat message
 */
async function sendChatMessage() {
  const input = elements.chatInput;
  const question = input.value.trim();
  
  if (!question || !currentCourse) return;

  input.value = '';

  const welcome = elements.chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.style.display = 'none';

  addChatMessage(question, 'user');
  const loadingId = addChatMessage('Thinking...', 'assistant');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHAT',
      data: {
        question,
        courseId: currentCourse.id
      }
    });

    document.getElementById(loadingId)?.remove();

    if (response.success) {
      addChatMessage(response.data.answer || 'I couldn\'t find an answer.', 'assistant');
    } else {
      addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
    }
  } catch (error) {
    document.getElementById(loadingId)?.remove();
    addChatMessage('Connection error. Make sure the backend is running.', 'assistant');
  }
}

/**
 * Add chat message
 */
function addChatMessage(text, type) {
  const id = `msg-${Date.now()}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = `chat-message ${type}`;
  div.innerHTML = text;
  
  elements.chatMessages.appendChild(div);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  
  return id;
}

/**
 * Export ICS calendar
 */
function exportICS() {
  if (!currentCourse) return;

  const assignments = currentCourse.assignments || [];
  const includeTBD = document.getElementById('include-tbd')?.checked || false;
  const reminderMinutes = settings.ics?.defaultReminderMinutes || 1440;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SyllaBud//Chrome Extension//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(currentCourse.course?.title || 'Course')}`
  ];

  for (const a of assignments) {
    if (!a.dueDate && !includeTBD) continue;

    const uid = `syllabud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@syllabud.app`;
    const now = formatICSDate(new Date(), true);
    
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    
    if (a.dueDate) {
      const date = new Date(a.dueDate);
      if (a.dueTime) {
        lines.push(`DTSTART:${formatICSDate(date, true)}`);
        lines.push(`DTEND:${formatICSDate(date, true)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${formatICSDate(date, false)}`);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${formatICSDate(nextDay, false)}`);
      }
    }
    
    lines.push(`SUMMARY:${escapeICS(a.title || 'Assignment')}`);
    
    if (a.category) {
      lines.push(`CATEGORIES:${escapeICS(a.category)}`);
    }
    
    lines.push('BEGIN:VALARM');
    lines.push(`TRIGGER:-PT${reminderMinutes}M`);
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Assignment due soon');
    lines.push('END:VALARM');
    
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const content = lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const title = (currentCourse.course?.title || 'Course').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const term = (currentCourse.course?.term || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  const filename = term ? `SyllaBud_${title}_${term}.ics` : `SyllaBud_${title}.ics`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Format date for ICS
 */
function formatICSDate(date, includeTime) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  
  if (!includeTime) return `${year}${month}${day}`;
  
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escape ICS special characters
 */
function escapeICS(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Show settings panel
 */
function showSettings() {
  elements.settingsPanel.style.display = 'block';
}

/**
 * Hide settings panel
 */
function hideSettings() {
  elements.settingsPanel.style.display = 'none';
}
