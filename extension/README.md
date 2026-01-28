# SyllaBud Extension

Chrome Extension component of SyllaBud - the AI-powered syllabus analyzer.

## Structure

```
extension/
├── manifest.json         # MV3 manifest
├── service_worker.js     # Background script
├── content_script.js     # Injected UI (floating button)
├── content_style.css     # Floating button styles
├── popup.html            # Extension popup
├── popup.css             # Popup styles
├── popup.js              # Popup logic
├── modules/
│   ├── storage.js        # Course data management
│   ├── extract.js        # Text extraction
│   ├── ics.js            # Calendar generation
│   ├── grade.js          # Grade calculations
│   ├── retrieval.js      # RAG/BM25 retrieval
│   └── api.js            # Backend communication
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Installation

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `extension` folder

## Development

### Debugging

1. **Service Worker:** Right-click extension icon → "Inspect views: service worker"
2. **Popup:** Right-click popup → "Inspect"
3. **Content Script:** Open page DevTools → Console

### Key Files

#### `manifest.json`

Manifest V3 configuration with:
- `activeTab`, `scripting`, `storage` permissions
- `<all_urls>` host permission for content script
- Service worker registration
- Content script injection

#### `service_worker.js`

Handles:
- Text extraction from tabs
- Syllabus analysis via backend
- Message routing between components
- Context menu setup

#### `content_script.js`

Provides:
- Floating "Analyze Syllabus" button
- Toast notifications
- Drag functionality for button positioning

#### `popup.js`

Main UI logic for:
- Course switching
- Grade entry and calculation
- Chat interface
- Calendar export
- Settings management

### Module Overview

#### `storage.js`
- `saveCourse(course)` - Save/update course data
- `getCourse(courseId)` - Retrieve single course
- `getAllCourses()` - List all courses
- `deleteCourse(courseId)` - Remove course
- `getSettings()` / `saveSettings()` - User preferences

#### `extract.js`
- `extractText(document)` - Extract text from DOM
- `detectPageType(url, document)` - Identify Canvas/Google Docs/etc.
- `chunkText(text, options)` - Split for RAG processing

#### `ics.js`
- `generateICS(assignments, options)` - Create ICS content
- `downloadICS(icsContent, filename)` - Trigger download
- `formatICSDate(date)` - Convert to ICS format

#### `grade.js`
- `calculateWeightedGrade(categories, scores, options)` - Weighted calculation
- `calculatePointsGrade(assignments, scores, options)` - Points-based
- Handles drop-lowest, extra credit, unfilled defaults

#### `retrieval.js`
- `buildIndex(chunks)` - Create TF-IDF index
- `retrieveChunks(query, index, options)` - BM25 retrieval
- `enhancedRetrieve(query, chunks, options)` - With diversity

#### `api.js`
- `structureSyllabus(text, url)` - Analyze syllabus text
- `chat(messages, context, settings)` - Chat with backend
- `checkHealth()` - Verify backend status

## Data Model

### Course Object

```javascript
{
  id: "course_abc123",
  name: "CS 101: Intro to Programming",
  instructor: "Dr. Smith",
  term: "Fall 2024",
  sourceUrl: "https://canvas.edu/...",
  extractedAt: "2024-01-15T10:30:00Z",
  rawText: "Full syllabus text...",
  chunks: ["Chunk 1...", "Chunk 2..."],
  
  gradingScheme: {
    type: "weighted",
    categories: [
      { name: "Homework", weight: 30, dropLowest: 1 },
      { name: "Exams", weight: 50, dropLowest: 0 },
      { name: "Participation", weight: 20, dropLowest: 0 }
    ]
  },
  
  assignments: [
    {
      id: "hw1",
      title: "Homework 1",
      category: "Homework",
      dueDate: "2024-02-01T23:59:00",
      maxPoints: 100
    }
  ],
  
  policies: {
    lateWork: "10% per day, max 3 days",
    attendance: "Required, 3 unexcused max",
    academicIntegrity: "Zero tolerance..."
  }
}
```

### Settings Object

```javascript
{
  unfilledDefault: 100,    // Treat ungraded as this %
  reminderDays: 1,         // ICS alarm days before
  backendUrl: "http://localhost:3000"
}
```

## Message Protocol

### Extension → Service Worker

```javascript
chrome.runtime.sendMessage({
  action: "analyzeSyllabus" | "chat" | "getExtractedText",
  payload: { ... }
});
```

### Service Worker → Content Script

```javascript
chrome.tabs.sendMessage(tabId, {
  action: "showToast" | "extractText",
  payload: { ... }
});
```

## Icons

The extension requires icons in `icons/` folder:
- `icon16.png` - Favicon, context menus
- `icon32.png` - Windows taskbar
- `icon48.png` - Extensions page
- `icon128.png` - Web Store listing

Create simple 📚 or 📋 themed icons at these sizes.

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current tab for extraction |
| `scripting` | Inject extraction scripts |
| `storage` | Save course data locally |
| `<all_urls>` | Content script on any syllabus page |

## Building for Production

1. Remove any `console.log` statements
2. Minify JS/CSS if desired
3. Update icons with final designs
4. Test all features
5. Create `.zip` of extension folder
6. Submit to Chrome Web Store

## Testing

Test the extension with:
- Sample syllabi in `fixtures/`
- Different LMS platforms (Canvas, Blackboard, etc.)
- Google Docs syllabi
- Plain HTML pages

Check for:
- ✅ Text extraction works
- ✅ Analysis completes successfully
- ✅ Grades calculate correctly
- ✅ ICS exports properly
- ✅ Chat responds appropriately
