/**
 * SyllaBud API Module
 * Handles communication with the backend Gemini proxy
 */

// Default backend URL (can be overridden in settings)
let BACKEND_URL = 'http://localhost:3000';

/**
 * Set the backend URL
 */
function setBackendUrl(url) {
  BACKEND_URL = url;
}

/**
 * Get the current backend URL
 */
function getBackendUrl() {
  return BACKEND_URL;
}

/**
 * Make API call to backend
 */
async function callBackend(task, payload, timeout = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${BACKEND_URL}/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task, payload }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded: ${data.error?.message || 'Too many requests'}`);
      }
      throw new Error(data.error?.message || `Backend error: ${response.status}`);
    }
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The server may be overloaded.');
    }
    
    throw error;
  }
}

/**
 * Structure syllabus text using Gemini
 */
async function structureSyllabus(extractedText, url = '') {
  const response = await callBackend('STRUCTURE_SYLLABUS', {
    text: extractedText,
    sourceUrl: url
  }, 120000); // 2 minute timeout for structuring
  
  if (!response.ok) {
    throw new Error(response.error?.message || 'Failed to structure syllabus');
  }
  
  return response.data;
}

/**
 * Repair malformed JSON from Gemini
 */
async function repairJSON(malformedJson, originalPrompt = '') {
  const response = await callBackend('REPAIR_JSON', {
    json: malformedJson,
    context: originalPrompt
  });
  
  if (!response.ok) {
    throw new Error(response.error?.message || 'Failed to repair JSON');
  }
  
  return response.data;
}

/**
 * Chat with context about the syllabus
 */
async function chat(question, context) {
  const { 
    relevantChunks = [], 
    syllabusData = {}, 
    userGrades = {},
    chatHistory = []
  } = context;
  
  const response = await callBackend('CHAT', {
    question,
    chunks: relevantChunks,
    syllabus: syllabusData,
    grades: userGrades,
    history: chatHistory.slice(-6) // Last 3 exchanges
  });
  
  if (!response.ok) {
    throw new Error(response.error?.message || 'Chat request failed');
  }
  
  return response.data;
}

/**
 * Check backend health
 */
async function checkHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      return { healthy: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { healthy: true, ...data };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Get rate limit status
 */
async function getRateLimitStatus() {
  try {
    const response = await fetch(`${BACKEND_URL}/rate-limit-status`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    return null;
  }
}

/**
 * Structure syllabus with automatic JSON repair
 */
async function structureSyllabusWithRetry(extractedText, url = '') {
  try {
    return await structureSyllabus(extractedText, url);
  } catch (error) {
    // If it's a JSON parsing error, try to repair
    if (error.message.includes('JSON') || error.message.includes('parse')) {
      console.log('Attempting JSON repair...');
      try {
        const repaired = await repairJSON(error.rawResponse || '', 'STRUCTURE_SYLLABUS');
        return repaired;
      } catch (repairError) {
        throw new Error(`Failed to parse and repair response: ${error.message}`);
      }
    }
    throw error;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setBackendUrl,
    getBackendUrl,
    callBackend,
    structureSyllabus,
    repairJSON,
    chat,
    checkHealth,
    getRateLimitStatus,
    structureSyllabusWithRetry
  };
}

export {
  setBackendUrl,
  getBackendUrl,
  callBackend,
  structureSyllabus,
  repairJSON,
  chat,
  checkHealth,
  getRateLimitStatus,
  structureSyllabusWithRetry
};
