# SyllaBud — One‑Shot Build Prompt (All‑Knowing AI)

> This document is a **single, complete prompt** intended for a hypothetical all‑knowing AI model that can build the entire SyllaBud Chrome extension + backend in one pass.

---

## Role

You are an **all‑knowing senior software engineer and product designer**. Build **SyllaBud** end‑to‑end in one pass: a **Chrome Extension (Manifest V3)** plus a small **backend proxy** that calls **Gemini 3 Flash Preview** using a **Google AI Studio API key** stored server‑side.

SyllaBud works on **any syllabus source**:
- Canvas / LMS pages
- Google Docs
- Normal HTML pages
- PDFs viewable in the browser (no OCR)

A user clicks **“Analyze Syllabus”** on the current page, and the extension automatically builds:
1. A **syllabus chatbot**
2. A **weighted grade calculator** (with stored user grades + what‑if)
3. **Due‑date extraction** with downloadable **.ics calendar export**

---

## Hard Constraints (Must Follow)

### AI Model & API
- **Model:** `gemini-3-flash-preview`
- **API access:** Google AI Studio
- **Calls MUST be server‑side only** (never expose API key in extension)
- **Backend uses official SDK style**:

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: "Explain how AI works in a few words",
});
```

### Storage & Privacy
- **Local‑only storage** in the browser (chrome.storage.local / IndexedDB)
- No cloud DB, no user auth, no server‑side persistence of syllabus text

### Rate Limiting (Safety Net)
- **Max 50 Gemini calls per user per day** (best‑effort, IP‑based)
- If call‑count limiting fails, enforce **100,000 tokens/user/day** (approximate tokens = chars ÷ 4)
- Return HTTP `429` with clear error JSON on limit exceeded

### Platform
- Chrome **Manifest V3**
- Chromium compatible (Edge/Brave should work)
- Chrome is the primary target

### OCR
- **No OCR** required or implemented
- PDFs must be text‑extractable; otherwise show fallback UI (paste/upload)

---

## UX Requirements (Compact & Efficient)

- **Floating in‑page button:** “Analyze Syllabus” (content script)
- **Primary UI:** extension popup (small footprint)
- Tabs:
  - Overview
  - Grades
  - Due Dates
  - Policies
  - Chat
- Clear progress indicators and graceful failure states

---

## Architecture

### 1. Chrome Extension (MV3)

**Files**
- `manifest.json`
- `service_worker.js`
- `content_script.js`
- `popup.html`
- `popup.js`
- `popup.css`

**Modules**
- `modules/storage.js` – local persistence
- `modules/extract.js` – HTML + PDF text extraction
- `modules/ics.js` – ICS + VALARM generation
- `modules/grade.js` – grade math + what‑if
- `modules/retrieval.js` – local TF‑IDF/BM25‑style chunk retrieval
- `modules/api.js` – backend `/gemini` calls

**Permissions**
- `activeTab`, `scripting`, `storage`
- `host_permissions`: `<all_urls>`

---

### 2. Backend Gemini Proxy (Node.js)

**Responsibilities**
- Endpoint: `POST /gemini`
- Input validation
- Rate limiting (per IP)
- Calls Gemini 3 Flash Preview
- No persistent storage of user data

**Security**
- API key only in env var: `GEMINI_API_KEY`
- CORS:
  - Dev: allow all chrome‑extension origins
  - Prod: allowlisted extension IDs via env var

**Suggested stack**
- Node.js + Express or Fastify

---

## Canonical Data Model (Per Course)

```json
{
  "course": {
    "title": "",
    "institution": "",
    "term": "",
    "instructor": "",
    "source": { "url": "", "type": "html|pdf|google_doc|lms" }
  },
  "grading": {
    "schemeType": "weighted|points|mixed|unknown",
    "categories": [],
    "extraCredit": [],
    "letterGradeScale": [],
    "gotchas": {}
  },
  "assignments": [],
  "policies": {},
  "raw": {
    "extractedText": "",
    "chunks": []
  },
  "userGrades": {},
  "settings": {
    "treatUnfilledAs": 100,
    "ics": { "defaultReminderMinutes": 1440 }
  }
}
```

**Important rule:** Unfilled grade items are treated as **100%**.

---

## Extraction Pipeline

### Step A — Text Extraction

- **HTML / LMS / Google Docs**
  - `document.body.innerText`
  - Preserve headings, lists, tables (markdown‑like)

- **PDFs**
  - Detect embedded or direct PDF
  - Extract text using `pdfjs-dist`

Fallback:
- Paste syllabus text
- Upload text‑based PDF

---

### Step B — Gemini Task: `STRUCTURE_SYLLABUS`

Send extracted text to backend.

**Must extract:**
- Grading categories + weights
- Assignment list + due dates
- Late / exam / collaboration policies
- Letter grade cutoffs
- Extra credit rules
- Soft vs hard deadlines
- Formatting warnings

**Rules**
- Output **strict JSON only**
- If info missing → `null` + warning
- Do **not hallucinate**

If invalid JSON:
- Automatically call `REPAIR_JSON` once

---

### Step C — Chunking for Chat

- Chunk extracted text into ~1000–1500 chars
- ~150 char overlap
- Store chunk IDs for citation

---

## Chat System (Grounded + Grade‑Aware)

On each user question:
1. Retrieve top 5 relevant chunks locally (TF‑IDF/BM25)
2. Send to Gemini with:
   - User question
   - Relevant chunks
   - Structured syllabus JSON
   - Stored user grades

**Instructions to model:**
- Cite chunk IDs like `[chunk_12]`
- If info missing, say so clearly

---

## Grade Calculator Rules

- Prefer weighted grading
- Fallback to points‑based
- User inputs grades per assignment/category
- Unfilled items default to **100**
- What‑if mode for hypothetical scores

### Gotchas
- Extra credit:
  - Represent explicitly
  - Default to additive percent bump if ambiguous
  - Warn user and allow toggle
- Drop lowest N items if detected
- Multiple grading schemes → compute all, take best

---

## Due Dates & ICS Export

- Generate `.ics` file
- One event per dated assignment
- Add `VALARM` → 1 day before
- All‑day events if time missing
- Assignments without due dates:
  - Shown as **TBD**
  - Excluded from ICS by default
  - Optional toggle to include as labeled TBD events

Filename:
```
SyllaBud_<CourseTitle>_<Term>.ics
```

---

## UI Specification

**Popup**
- Header: course title + current grade
- Buttons: Re‑analyze, Export ICS
- Tabs:
  - Overview
  - Grades
  - Due Dates
  - Policies
  - Chat

**In‑page**
- Floating “Analyze Syllabus” button
- Toasts for progress/errors

---

## Backend API Contract

`POST /gemini`

```json
{
  "task": "STRUCTURE_SYLLABUS" | "REPAIR_JSON" | "CHAT",
  "payload": {}
}
```

Responses:
- Success: `{ "ok": true, "data": {}, "usage": {} }`
- Error: `{ "ok": false, "error": { "code": "", "message": "" } }`

---

## Deliverables

1. Full Chrome extension codebase
2. Backend proxy using `@google/genai`
3. Rate limiting implementation
4. Unit tests:
   - Grade math
   - ICS generation
5. Sample syllabus fixtures
6. Setup & deployment documentation

---

## Final Instruction

Build the entire system in a **production‑ready** state, with clean, commented code, a compact UI, and clear error handling. Assume no further clarification will be provided.

