# SyllaBud Backend

Node.js backend proxy for the SyllaBud Chrome extension. Handles Gemini API calls with rate limiting.

## Setup

### Prerequisites

- Node.js 18+
- Google AI Studio API key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your API key
nano .env  # or use your preferred editor
```

### Configuration

Edit `.env`:

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional (defaults shown)
PORT=3000
MAX_REQUESTS_PER_DAY=50
MAX_TOKENS_PER_DAY=100000
ALLOWED_EXTENSION_IDS=
NODE_ENV=development
```

### Running

```bash
# Development
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000` (or your configured PORT).

## API Reference

### `POST /gemini`

Main endpoint for all AI operations.

#### Request Headers

```
Content-Type: application/json
X-Extension-ID: (optional) Chrome extension ID for production validation
```

#### Request Body

```json
{
  "task": "STRUCTURE_SYLLABUS" | "REPAIR_JSON" | "CHAT",
  "payload": { ... }
}
```

#### Tasks

##### STRUCTURE_SYLLABUS

Analyzes syllabus text and extracts structured data.

```json
{
  "task": "STRUCTURE_SYLLABUS",
  "payload": {
    "syllabusText": "Full syllabus text...",
    "sourceUrl": "https://canvas.edu/..."
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "name": "CS 101: Intro to Programming",
    "instructor": "Dr. Smith",
    "term": "Fall 2024",
    "gradingScheme": {
      "type": "weighted",
      "categories": [...]
    },
    "assignments": [...],
    "policies": {...}
  },
  "usage": {
    "inputTokens": 1500,
    "outputTokens": 800,
    "totalTokensToday": 2300
  }
}
```

##### REPAIR_JSON

Attempts to fix malformed JSON from previous responses.

```json
{
  "task": "REPAIR_JSON",
  "payload": {
    "malformedJson": "{ invalid json... }",
    "context": "This should be a course object with..."
  }
}
```

##### CHAT

Conversational Q&A grounded in syllabus content.

```json
{
  "task": "CHAT",
  "payload": {
    "messages": [
      { "role": "user", "content": "What's the late work policy?" }
    ],
    "context": "Relevant syllabus excerpts...",
    "courseName": "CS 101"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "role": "assistant",
    "content": "According to the syllabus, late work receives a 10% deduction per day..."
  },
  "usage": { ... }
}
```

#### Error Responses

**Rate Limited (429):**
```json
{
  "ok": false,
  "error": "Rate limit exceeded. Try again tomorrow.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}
```

**Invalid Request (400):**
```json
{
  "ok": false,
  "error": "Missing required field: task",
  "code": "INVALID_REQUEST"
}
```

**Server Error (500):**
```json
{
  "ok": false,
  "error": "Gemini API error: [details]",
  "code": "GEMINI_ERROR"
}
```

### `GET /health`

Health check endpoint.

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### `GET /rate-limit-status`

Check current rate limit status.

```json
{
  "requestsRemaining": 45,
  "requestsLimit": 50,
  "tokensUsedToday": 5000,
  "tokensLimit": 100000,
  "resetsAt": "2024-01-16T00:00:00.000Z"
}
```

## Rate Limiting

### Request Limit

- **50 requests per day** per IP (configurable via `MAX_REQUESTS_PER_DAY`)
- Uses `express-rate-limit`
- Resets at midnight UTC

### Token Limit

- **100,000 tokens per day** per IP (configurable via `MAX_TOKENS_PER_DAY`)
- Tracked per-request based on Gemini response
- Fallback protection against runaway usage

### Production Considerations

For production deployment:

1. Set `ALLOWED_EXTENSION_IDS` to your published extension ID(s)
2. Consider using Redis for rate limit storage (current: in-memory)
3. Add proper logging and monitoring
4. Use HTTPS with proper certificates

## Testing

```bash
npm test
```

Tests cover:
- Grade calculation module (weighted, points, drop lowest, extra credit)
- ICS generation module (date formatting, escaping, VALARM)

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# Structure syllabus
curl -X POST http://localhost:3000/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "task": "STRUCTURE_SYLLABUS",
    "payload": {
      "syllabusText": "CS 101 - Introduction to Computer Science\nInstructor: Dr. Smith\n...",
      "sourceUrl": "https://example.com/syllabus"
    }
  }'

# Chat
curl -X POST http://localhost:3000/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "task": "CHAT",
    "payload": {
      "messages": [{"role": "user", "content": "When is the final exam?"}],
      "context": "Final Exam: December 15, 2024 at 2:00 PM in Room 301",
      "courseName": "CS 101"
    }
  }'
```

## Deployment

### Railway / Render / Heroku

1. Set environment variables in dashboard
2. Ensure `PORT` is set by platform (usually automatic)
3. Deploy via Git push

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name api.syllabud.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Security

### API Key Protection

- API key is **never** sent to the client
- Stored only in server environment variables
- Not logged or exposed in error messages

### Extension Validation (Production)

When `ALLOWED_EXTENSION_IDS` is set:
- Only requests from listed extension IDs are accepted
- Validates `X-Extension-ID` header
- Returns 403 for unauthorized requests

### CORS

- Development: All origins allowed
- Production: Restrict to specific origins

## Troubleshooting

### "GEMINI_API_KEY is required"

Ensure `.env` file exists and contains valid API key.

### Rate limit exceeded immediately

Check if another instance is running, or if IP is shared (NAT/VPN).

### "Gemini API error: 429"

You've hit Google's API rate limits. Wait and retry, or upgrade API plan.

### CORS errors in browser

Ensure backend is running and URL is correct in extension settings.

## Files

```
backend/
├── server.js          # Main Express server
├── package.json       # Dependencies
├── .env.example       # Environment template
├── tests/
│   ├── grade.test.js  # Grade calculator tests
│   ├── ics.test.js    # ICS generation tests
│   └── run-tests.js   # Test runner
└── README.md          # This file
```
