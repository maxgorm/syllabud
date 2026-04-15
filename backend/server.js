/**
 * SyllaBud Backend Server
 * Proxy for Gemini API calls with rate limiting
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Validate API key
if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Token tracking per IP (in-memory, resets on server restart)
const tokenUsage = new Map();
const MAX_TOKENS_PER_DAY = parseInt(process.env.MAX_TOKENS_PER_DAY) || 100000;

/**
 * CORS configuration
 * - Development: Allow all chrome-extension origins
 * - Production: Allow only specific extension IDs
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Allow chrome-extension origins
    if (origin.startsWith('chrome-extension://')) {
      const allowedIds = process.env.ALLOWED_EXTENSION_IDS;
      
      if (!allowedIds || allowedIds === '*' || process.env.NODE_ENV === 'development') {
        // Development mode: allow all extensions
        callback(null, true);
      } else {
        // Production: check against allowlist
        const extensionId = origin.replace('chrome-extension://', '');
        const allowedList = allowedIds.split(',').map(id => id.trim());
        
        if (allowedList.includes(extensionId)) {
          callback(null, true);
        } else {
          callback(new Error('Extension not allowed'));
        }
      }
    } else {
      // Allow localhost for development
      if (origin.includes('localhost') && process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

/**
 * Rate limiter: 50 requests per day per IP
 */
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: parseInt(process.env.MAX_REQUESTS_PER_DAY) || 50,
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Daily request limit exceeded. Please try again tomorrow.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
  }
});

/**
 * Token-based rate limiting middleware
 */
function tokenRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const today = new Date().toDateString();
  
  const key = `${ip}-${today}`;
  const currentTokens = tokenUsage.get(key) || 0;
  
  if (currentTokens >= MAX_TOKENS_PER_DAY) {
    return res.status(429).json({
      ok: false,
      error: {
        code: 'TOKEN_LIMIT_EXCEEDED',
        message: `Daily token limit (${MAX_TOKENS_PER_DAY}) exceeded. Please try again tomorrow.`
      }
    });
  }
  
  req.tokenKey = key;
  req.currentTokens = currentTokens;
  next();
}

/**
 * Track token usage
 */
function trackTokens(key, text) {
  // Approximate tokens = characters / 4
  const tokens = Math.ceil((text || '').length / 4);
  const current = tokenUsage.get(key) || 0;
  tokenUsage.set(key, current + tokens);
  return tokens;
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * Rate limit status endpoint
 */
app.get('/rate-limit-status', (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const today = new Date().toDateString();
  const key = `${ip}-${today}`;
  
  const tokensUsed = tokenUsage.get(key) || 0;
  
  res.json({
    ip: ip.substring(0, 10) + '***',
    tokensUsed,
    tokensRemaining: Math.max(0, MAX_TOKENS_PER_DAY - tokensUsed),
    maxTokensPerDay: MAX_TOKENS_PER_DAY
  });
});

/**
 * Main Gemini API endpoint
 */
app.post('/gemini', apiLimiter, tokenRateLimiter, async (req, res) => {
  try {
    const { task, payload } = req.body;
    
    if (!task || !payload) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing task or payload'
        }
      });
    }
    
    let result;
    
    switch (task) {
      case 'STRUCTURE_SYLLABUS':
        result = await structureSyllabus(payload);
        break;
      case 'REPAIR_JSON':
        result = await repairJSON(payload);
        break;
      case 'CHAT':
        result = await chat(payload);
        break;
      default:
        return res.status(400).json({
          ok: false,
          error: {
            code: 'UNKNOWN_TASK',
            message: `Unknown task: ${task}`
          }
        });
    }
    
    // Track token usage
    const inputTokens = trackTokens(req.tokenKey, JSON.stringify(payload));
    const outputTokens = trackTokens(req.tokenKey, JSON.stringify(result));
    
    res.json({
      ok: true,
      data: result,
      usage: {
        inputTokens,
        outputTokens,
        totalTokensToday: tokenUsage.get(req.tokenKey)
      }
    });
    
  } catch (error) {
    console.error('Gemini API error:', error);
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'API_ERROR',
        message: error.message || 'An error occurred while processing your request'
      }
    });
  }
});

/**
 * Structure syllabus using Gemini
 */
async function structureSyllabus(payload) {
  const { text, sourceUrl } = payload;
  
  if (!text || text.length < 50) {
    throw new Error('Syllabus text is too short');
  }
  
  const prompt = `You are a syllabus parsing assistant. Analyze the following syllabus text and extract structured information.

IMPORTANT RULES:
1. Output ONLY valid JSON - no markdown, no explanations
2. If information is not found, use null - do NOT make up data
3. Parse dates in ISO 8601 format (YYYY-MM-DD)
4. Extract ALL assignments, exams, and due dates mentioned
5. Identify the grading scheme type: "weighted", "points", "mixed", or "unknown"

CRITICAL: All percentage/weight values MUST be whole numbers (e.g., 10 for 10%, NOT 0.1 or 0.10). 
If syllabus says "10%", output 10. If it says "15%", output 15. Never use decimals for percentages.

Output this exact JSON structure:
{
  "course": {
    "title": "string or null",
    "institution": "string or null",
    "term": "string or null - e.g., 'Fall 2024', 'Spring 2025'",
    "instructor": "string or null"
  },
  "grading": {
    "schemeType": "weighted|points|mixed|unknown",
    "categories": [
      {
        "id": "unique_id",
        "name": "Category Name",
        "weight": "number as whole percentage (10 means 10%, NOT 0.1) or null",
        "dropLowest": number or 0,
        "assignments": [
          {
            "id": "unique_id",
            "title": "Assignment Title",
            "pointsPossible": number or null,
            "dueDate": "YYYY-MM-DD or null",
            "dueTime": "HH:MM or null",
            "description": "string or null"
          }
        ]
      }
    ],
    "extraCredit": [
      {
        "id": "unique_id",
        "title": "Extra Credit Name",
        "type": "percentage_add|points|replacement",
        "maxPoints": number or null,
        "percentageValue": number or null
      }
    ],
    "letterGradeScale": [
      { "letter": "A", "min": 93 },
      { "letter": "A-", "min": 90 },
      { "letter": "B+", "min": 87 },
      { "letter": "B", "min": 83 },
      { "letter": "B-", "min": 80 },
      { "letter": "C+", "min": 77 },
      { "letter": "C", "min": 73 },
      { "letter": "C-", "min": 70 },
      { "letter": "D+", "min": 67 },
      { "letter": "D", "min": 63 },
      { "letter": "D-", "min": 60 },
      { "letter": "F", "min": 0 }
    ],
    "gotchas": {
      "hasDropLowest": boolean,
      "hasExtraCredit": boolean,
      "hasMultipleSchemes": boolean,
      "warnings": ["array of warning strings about ambiguities"]
    }
  },
  "assignments": [
    {
      "id": "unique_id",
      "title": "Assignment Title",
      "category": "Category Name or null",
      "dueDate": "YYYY-MM-DD or null",
      "dueTime": "HH:MM or null",
      "pointsPossible": number or null,
      "weight": number or null,
      "description": "string or null",
      "isExam": boolean
    }
  ],
  "policies": {
    "late_work": "string description or null",
    "attendance": "string description or null",
    "academic_integrity": "string description or null",
    "exam_policy": "string description or null",
    "collaboration": "string description or null",
    "makeup_policy": "string description or null",
    "other": "any other important policies or null"
  }
}

SYLLABUS TEXT:
${text.substring(0, 50000)}

Remember: Output ONLY the JSON object, nothing else.`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text();
  
  // Try to parse JSON from response
  let parsed;
  try {
    // Remove any markdown code blocks if present
    let cleanJson = responseText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    parsed = JSON.parse(cleanJson);
  } catch (parseError) {
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error('Failed to parse syllabus structure. Invalid JSON response.');
      }
    } else {
      throw new Error('Failed to parse syllabus structure. No JSON found in response.');
    }
  }
  
  // Validate required fields
  if (!parsed.course) parsed.course = {};
  if (!parsed.grading) parsed.grading = { schemeType: 'unknown', categories: [] };
  if (!parsed.assignments) parsed.assignments = [];
  if (!parsed.policies) parsed.policies = {};
  
  return parsed;
}

/**
 * Repair malformed JSON
 */
async function repairJSON(payload) {
  const { json, context } = payload;
  
  const prompt = `Fix this malformed JSON and return ONLY valid JSON:

${json}

Context: This was supposed to be a ${context || 'structured data'} response.

Return ONLY the fixed JSON, no explanations.`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text();
  
  // Clean and parse
  let cleanJson = responseText
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  
  return JSON.parse(cleanJson);
}

/**
 * Chat about syllabus
 */
async function chat(payload) {
  const { question, chunks, syllabus, grades, history, rawTextExcerpt } = payload;
  
  if (!question) {
    throw new Error('Question is required');
  }
  
  // Build context
  let context = '';
  
  if (chunks && chunks.length > 0) {
    context += 'RETRIEVED SYLLABUS EVIDENCE:\n';
    chunks.forEach((chunk) => {
      context += `[${chunk.id}] ${chunk.text}\n\n`;
    });
  }
  
  if (syllabus) {
    context += '\nSTRUCTURED COURSE DATA:\n';
    context += JSON.stringify(syllabus, null, 2);
  }
  
  if (grades && Object.keys(grades).length > 0) {
    context += '\n\nSTUDENT CURRENT GRADES:\n';
    context += JSON.stringify(grades, null, 2);
  }

  if (rawTextExcerpt) {
    context += `\n\nSUPPORTING SYLLABUS TEXT:\n${rawTextExcerpt}`;
  }
  
  // Build conversation history
  let historyText = '';
  if (history && history.length > 0) {
    historyText = '\nRECENT CONVERSATION:\n';
    history.forEach((msg) => {
      historyText += `${msg.role.toUpperCase()}: ${msg.content}\n`;
    });
  }
  
  const prompt = `You are SyllaBud, an assistant that answers questions about a single course syllabus.

Use the context in this order:
1. Structured course data for the overall answer.
2. Retrieved syllabus evidence for exact details, wording, dates, and policy grounding.
3. Recent conversation only to resolve follow-up references like "that", "it", or "those assignments".

Answering rules:
1. Never make up facts that are not supported by the context.
2. If the answer is missing or ambiguous, say so plainly: "I don't have that information in the syllabus."
3. Do not include chunk ids, bracketed references, or source tags in the final answer.
4. If the user asks about deadlines, include the exact due date from context when available.
5. If the user asks about grades or weighting, use the provided student grades and grading data.
6. Keep the answer concise, but include the direct answer first.
7. If the syllabus appears to conflict with itself, point out the conflict instead of choosing one version.

${context}
${historyText}

STUDENT QUESTION: ${question}

Provide the best grounded answer you can.`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text();
  const cleanedResponseText = stripChunkReferences(responseText || '');
  
  return {
    answer: cleanedResponseText || 'I could not generate a response.',
    citations: []
  };
}

/**
 * Remove internal retrieval markers from model output
 */
const INTERNAL_RESPONSE_LABELS = [
  'RAW SYLLABUS EXCERPT',
  'SUPPORTING SYLLABUS TEXT',
  'RETRIEVED SYLLABUS EVIDENCE',
  'STRUCTURED COURSE DATA',
  'RECENT CONVERSATION',
  'STUDENT CURRENT GRADES'
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripChunkReferences(text) {
  let cleaned = text || '';

  cleaned = cleaned
    .replace(/\s*[\[(]chunk[^\])]*[\])]/gi, '')
    .replace(/\b(?:sources?|citations?)\s*:\s*chunk(?:[_-][a-z0-9]+)+(?:\s*,\s*chunk(?:[_-][a-z0-9]+)+)*/gi, '')
    .replace(/\s*,?\s*chunk(?:[_-][a-z0-9]+)+(?:\s*,\s*chunk(?:[_-][a-z0-9]+)+)*/gi, '')
    .replace(/\b(?:sources?|citations?|references?|evidence|context)\s*:\s*(?:raw|supporting|retrieved|structured|recent|student)[^.\n]*/gi, '');

  INTERNAL_RESPONSE_LABELS.forEach((label) => {
    const pattern = escapeRegExp(label).replace(/\s+/g, '\\s+');
    cleaned = cleaned
      .replace(new RegExp(`\\s*[\\[(]${pattern}[^\\])]*[\\])]`, 'gi'), '')
      .replace(new RegExp(`([.!?]\\s+)${pattern}(?=$|[.!?])`, 'g'), '$1')
      .replace(new RegExp(`(^|\\n)\\s*${pattern}(?::)?\\s*`, 'gm'), '$1');
  });

  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Clean up old token tracking data (run daily)
 */
function cleanupTokenTracking() {
  const today = new Date().toDateString();
  
  for (const [key] of tokenUsage) {
    if (!key.includes(today)) {
      tokenUsage.delete(key);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupTokenTracking, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    ok: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'An internal server error occurred'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║           SyllaBud Backend Server                 ║
╠═══════════════════════════════════════════════════╣
║  Status: Running                                  ║
║  Port: ${PORT}                                        ║
║  Environment: ${process.env.NODE_ENV || 'development'}                       ║
║  Max requests/day: ${process.env.MAX_REQUESTS_PER_DAY || 50}                            ║
║  Max tokens/day: ${MAX_TOKENS_PER_DAY}                          ║
╚═══════════════════════════════════════════════════╝
  `);
});

export default app;
