const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_ALLOWED_EXTENSION_IDS = '*';
const DEFAULT_VERTEX_LOCATION = 'us-central1';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const GOOGLE_VERTEX_API_BASE = 'https://aiplatform.googleapis.com/v1';

let vertexAccessTokenCache = {
  accessToken: null,
  expiresAt: 0
};

const INTERNAL_RESPONSE_LABELS = [
  'RAW SYLLABUS EXCERPT',
  'SUPPORTING SYLLABUS TEXT',
  'RETRIEVED SYLLABUS EVIDENCE',
  'STRUCTURED COURSE DATA',
  'RECENT CONVERSATION',
  'STUDENT CURRENT GRADES'
];

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (corsHeaders.get('Access-Control-Allow-Origin') === 'null') {
      return jsonResponse({
        ok: false,
        error: {
          code: 'CORS_BLOCKED',
          message: 'Origin is not allowed'
        }
      }, 403, corsHeaders);
    }

    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        runtime: 'cloudflare-workers',
        version: '1.0.0'
      }, 200, corsHeaders);
    }

    if (url.pathname === '/rate-limit-status' && request.method === 'GET') {
      return jsonResponse({
        configured: false,
        message: 'No per-user rate limit storage is configured for this Worker deployment.'
      }, 200, corsHeaders);
    }

    if (url.pathname === '/gemini' && request.method === 'POST') {
      return handleGeminiRequest(request, env, corsHeaders);
    }

    return jsonResponse({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found'
      }
    }, 404, corsHeaders);
  }
};

async function handleGeminiRequest(request, env, corsHeaders) {
  try {
    if (!getVertexConfig(env) && !getVertexApiKey(env) && !env.GEMINI_API_KEY) {
      throw new Error('No model credentials configured. Set Vertex AI service account secrets, GOOGLE_API_KEY, or GEMINI_API_KEY.');
    }

    const { task, payload } = await request.json();

    if (!task || !payload) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing task or payload'
        }
      }, 400, corsHeaders);
    }

    let data;
    switch (task) {
      case 'STRUCTURE_SYLLABUS':
        data = await structureSyllabus(payload, env);
        break;
      case 'REPAIR_JSON':
        data = await repairJSON(payload, env);
        break;
      case 'CHAT':
        data = await chat(payload, env);
        break;
      default:
        return jsonResponse({
          ok: false,
          error: {
            code: 'UNKNOWN_TASK',
            message: `Unknown task: ${task}`
          }
        }, 400, corsHeaders);
    }

    return jsonResponse({ ok: true, data }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: {
        code: 'API_ERROR',
        message: error.message || 'An error occurred while processing your request'
      }
    }, 500, corsHeaders);
  }
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  });

  if (!origin) {
    headers.set('Access-Control-Allow-Origin', '*');
    return headers;
  }

  if (origin.startsWith('chrome-extension://')) {
    const extensionId = origin.replace('chrome-extension://', '');
    const allowList = (env.ALLOWED_EXTENSION_IDS || DEFAULT_ALLOWED_EXTENSION_IDS)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (allowList.includes('*') || allowList.includes(extensionId)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      return headers;
    }
  }

  headers.set('Access-Control-Allow-Origin', 'null');
  return headers;
}

function jsonResponse(body, status = 200, headers = new Headers()) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function structureSyllabus(payload, env) {
  const { text } = payload;

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

  const responseText = await generateText(prompt, env);
  const parsed = parseJsonResponse(responseText, 'Failed to parse syllabus structure.');

  if (!parsed.course) parsed.course = {};
  if (!parsed.grading) parsed.grading = { schemeType: 'unknown', categories: [] };
  if (!parsed.assignments) parsed.assignments = [];
  if (!parsed.policies) parsed.policies = {};

  return parsed;
}

async function repairJSON(payload, env) {
  const { json, context } = payload;

  const prompt = `Fix this malformed JSON and return ONLY valid JSON:

${json}

Context: This was supposed to be a ${context || 'structured data'} response.

Return ONLY the fixed JSON, no explanations.`;

  const responseText = await generateText(prompt, env);
  return parseJsonResponse(responseText, 'Failed to repair JSON.');
}

async function chat(payload, env) {
  const { question, chunks, syllabus, grades, history, rawTextExcerpt } = payload;

  if (!question) {
    throw new Error('Question is required');
  }

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

  const responseText = await generateText(prompt, env);

  return {
    answer: stripChunkReferences(responseText || ''),
    citations: []
  };
}

async function generateText(prompt, env) {
  const vertexConfig = getVertexConfig(env);
  if (vertexConfig) {
    return generateTextWithVertexAI(prompt, env, vertexConfig);
  }

  const vertexApiKey = getVertexApiKey(env);
  if (vertexApiKey) {
    return generateTextWithVertexApiKey(prompt, env, vertexApiKey);
  }

  if (!env.GEMINI_API_KEY) {
    throw new Error('No model credentials configured. Set Vertex AI service account secrets, GOOGLE_API_KEY, or GEMINI_API_KEY.');
  }

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Gemini API error: ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
}

function getVertexApiKey(env) {
  return env.GOOGLE_API_KEY || env.VERTEX_API_KEY || null;
}

function getVertexConfig(env) {
  let jsonCredentials = null;

  if (env.GCP_SERVICE_ACCOUNT_JSON) {
    try {
      jsonCredentials = JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  const projectId = env.GCP_PROJECT_ID || jsonCredentials?.project_id || null;
  const clientEmail = env.GCP_CLIENT_EMAIL || jsonCredentials?.client_email || null;
  const privateKey = normalizePrivateKey(env.GCP_PRIVATE_KEY || jsonCredentials?.private_key || null);

  if (!projectId && !clientEmail && !privateKey) {
    return null;
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Vertex AI is partially configured. Set GCP_PROJECT_ID, GCP_CLIENT_EMAIL, and GCP_PRIVATE_KEY, or provide GCP_SERVICE_ACCOUNT_JSON.');
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    location: env.VERTEX_LOCATION || DEFAULT_VERTEX_LOCATION,
    model: env.VERTEX_MODEL || DEFAULT_MODEL
  };
}

function normalizePrivateKey(privateKey) {
  if (!privateKey) return null;
  return privateKey.replace(/\\n/g, '\n').trim();
}

async function generateTextWithVertexAI(prompt, env, config) {
  const accessToken = await getVertexAccessToken(env, config);
  const modelPath = `projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}`;
  const url = `${GOOGLE_VERTEX_API_BASE}/${modelPath}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Vertex AI error: ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Vertex AI returned an empty response');
  }

  return text;
}

async function generateTextWithVertexApiKey(prompt, env, apiKey) {
  const model = env.VERTEX_MODEL || DEFAULT_MODEL;
  const url = `${GOOGLE_VERTEX_API_BASE}/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Vertex AI API key error: ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Vertex AI returned an empty response');
  }

  return text;
}

async function getVertexAccessToken(env, config) {
  const now = Math.floor(Date.now() / 1000);
  if (vertexAccessTokenCache.accessToken && vertexAccessTokenCache.expiresAt - 60 > now) {
    return vertexAccessTokenCache.accessToken;
  }

  const assertion = await createServiceAccountJwt(config.clientEmail, config.privateKey, now);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    const message = data?.error_description || data?.error || 'Failed to obtain Vertex AI access token';
    throw new Error(message);
  }

  vertexAccessTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 3600)
  };

  return vertexAccessTokenCache.accessToken;
}

async function createServiceAccountJwt(clientEmail, privateKey, now) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: GOOGLE_CLOUD_PLATFORM_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function pemToArrayBuffer(pem) {
  const normalized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlEncodeJson(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncode(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer || value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseJsonResponse(responseText, fallbackMessage) {
  try {
    const cleanJson = responseText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    return JSON.parse(cleanJson);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error(`${fallbackMessage} Invalid JSON response.`);
      }
    }

    throw new Error(`${fallbackMessage} No JSON found in response.`);
  }
}

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
