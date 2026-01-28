# SyllaBud

**AI-Powered Syllabus Analyzer Chrome Extension**

SyllaBud automatically analyzes course syllabi and provides:
- 📚 **Syllabus Chatbot** - Ask questions about your course
- 📊 **Grade Calculator** - Track grades with what-if scenarios
- 📅 **Calendar Export** - Download .ics files with reminders

![SyllaBud Demo](docs/demo.gif)

## Features

### Works With Any Syllabus Source
- Canvas and other LMS pages
- Google Docs
- Standard HTML pages
- Text-based PDFs

### Smart Grade Calculator
- Weighted and points-based grading
- Automatic drop-lowest grade handling
- Extra credit support
- What-if mode for hypothetical grades
- Unfilled grades default to 100%

### Due Date Management
- Extracts all assignments and due dates
- Exports to .ics calendar format
- Configurable reminders (default: 1 day before)
- TBD assignments clearly marked

### AI-Powered Chat
- Ask questions about policies, deadlines, grading
- Grounded responses with source citations
- Context-aware with your current grades

## Installation

### Prerequisites
- Google Chrome (or Chromium-based browser)
- Node.js 18+ (for backend)
- Google AI Studio API key ([Get one free](https://makersuite.google.com/app/apikey))

### 1. Set Up Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your API key
# GEMINI_API_KEY=your_api_key_here

# Start the server
npm start
```

The backend will start on `http://localhost:3000`.

### 2. Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension` folder from this project
5. The SyllaBud icon should appear in your toolbar

### 3. Test It Out

1. Navigate to any syllabus page
2. Click the floating **"Analyze Syllabus"** button
3. Wait for analysis to complete
4. Click the SyllaBud extension icon to view results

## Usage

### Analyzing a Syllabus

1. **Navigate** to a syllabus page (Canvas, Google Docs, etc.)
2. **Click** the floating "Analyze Syllabus" button
3. **Wait** for AI analysis (usually 10-30 seconds)
4. **View** results in the extension popup

### Grade Calculator

1. Open the extension popup
2. Go to the **Grades** tab
3. Enter your scores for each assignment
4. Watch your grade update in real-time
5. Toggle **What-if Mode** to try hypothetical scores

### Calendar Export

1. Go to the **Due Dates** tab
2. Review extracted assignments
3. Check/uncheck "Include TBD items"
4. Click **Export .ics** in the action bar
5. Import the file into Google Calendar, Outlook, etc.

### Chatbot

1. Go to the **Chat** tab
2. Ask questions like:
   - "What's the late work policy?"
   - "When is the midterm?"
   - "How is the final grade calculated?"
3. Responses include citations to syllabus sections

## Configuration

### Extension Settings

Click the ⚙️ icon in the extension footer:

| Setting | Description | Default |
|---------|-------------|---------|
| Treat unfilled as | Default grade for ungraded items | 100% |
| Default reminder | ICS alarm before due date | 1 day |
| Backend URL | Server endpoint | http://localhost:3000 |

### Backend Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional
PORT=3000
MAX_REQUESTS_PER_DAY=50
MAX_TOKENS_PER_DAY=100000
ALLOWED_EXTENSION_IDS=   # Comma-separated for production
NODE_ENV=development
```

## Architecture

```
SyllaBud/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── service_worker.js
│   ├── content_script.js
│   ├── popup.html/js/css
│   └── modules/
│       ├── storage.js   # Local storage management
│       ├── extract.js   # Text extraction
│       ├── ics.js       # Calendar generation
│       ├── grade.js     # Grade calculations
│       ├── retrieval.js # TF-IDF/BM25 for RAG
│       └── api.js       # Backend communication
│
├── backend/             # Node.js Gemini Proxy
│   ├── server.js        # Express server
│   ├── package.json
│   └── tests/           # Unit tests
│
└── fixtures/            # Sample data
```

## API Reference

### Backend Endpoints

#### `POST /gemini`

Main endpoint for AI operations.

```json
{
  "task": "STRUCTURE_SYLLABUS" | "REPAIR_JSON" | "CHAT",
  "payload": { ... }
}
```

**Response:**
```json
{
  "ok": true,
  "data": { ... },
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "totalTokensToday": 5000
  }
}
```

#### `GET /health`

Health check endpoint.

#### `GET /rate-limit-status`

Returns current rate limit status for the client.

### Rate Limiting

- **50 requests per day** per IP (configurable)
- **100,000 tokens per day** per IP (fallback)
- Returns `429` with clear error message when exceeded

## Development

### Running Tests

```bash
cd backend
npm test
```

### Building for Production

1. Update `ALLOWED_EXTENSION_IDS` in backend `.env`
2. Set `NODE_ENV=production`
3. Deploy backend to your hosting provider
4. Update `backendUrl` in extension settings
5. Package extension for Chrome Web Store

### Adding New Features

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Privacy & Security

- ✅ All course data stored **locally** in your browser
- ✅ No cloud database or user accounts
- ✅ API key stored **server-side only**
- ✅ Syllabus text sent to Gemini for analysis only
- ✅ No persistent storage of your data on the server

## Troubleshooting

### "Connection error" in chat

- Ensure the backend server is running
- Check that `backendUrl` in settings matches your server

### Analysis taking too long

- Large syllabi may take 30-60 seconds
- Check backend logs for errors
- Verify your API key is valid

### Grade calculation seems wrong

- Check if "drop lowest" is being applied
- Verify the grading scheme type (weighted vs points)
- Try the "Reset All" button to clear grades

### Extension not appearing

- Ensure Developer mode is enabled
- Check for console errors in the extension
- Try reloading the extension

## Tech Stack

- **Extension:** Chrome Manifest V3, vanilla JavaScript
- **Backend:** Node.js, Express, @google/genai
- **AI:** Gemini 2.0 Flash (via Google AI Studio)
- **Storage:** chrome.storage.local

## License

MIT License - see [LICENSE](LICENSE)

## Acknowledgments

- Google Generative AI team for the Gemini API
- The Chrome Extensions team for MV3 documentation
- All beta testers who provided feedback

---

**Made with ❤️ for students everywhere**
