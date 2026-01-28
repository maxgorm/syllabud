/**
 * SyllaBud Retrieval Module
 * Local TF-IDF/BM25-style chunk retrieval for grounded chat
 */

/**
 * Tokenize text into words
 */
function tokenize(text) {
  if (!text) return [];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}

/**
 * Calculate term frequency (TF)
 */
function calculateTF(tokens) {
  const tf = {};
  const totalTokens = tokens.length;
  
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  
  // Normalize by total tokens
  for (const token in tf) {
    tf[token] = tf[token] / totalTokens;
  }
  
  return tf;
}

/**
 * Calculate inverse document frequency (IDF)
 */
function calculateIDF(chunks) {
  const documentCount = chunks.length;
  const documentFrequency = {};
  
  // Count how many documents contain each term
  for (const chunk of chunks) {
    const tokens = new Set(tokenize(chunk.text));
    for (const token of tokens) {
      documentFrequency[token] = (documentFrequency[token] || 0) + 1;
    }
  }
  
  // Calculate IDF
  const idf = {};
  for (const token in documentFrequency) {
    idf[token] = Math.log((documentCount + 1) / (documentFrequency[token] + 1)) + 1;
  }
  
  return idf;
}

/**
 * Build TF-IDF index for chunks
 */
function buildIndex(chunks) {
  if (!chunks || chunks.length === 0) {
    return { chunks: [], idf: {}, chunkVectors: [] };
  }
  
  const idf = calculateIDF(chunks);
  const chunkVectors = [];
  
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const tf = calculateTF(tokens);
    
    // Calculate TF-IDF vector
    const vector = {};
    for (const token in tf) {
      vector[token] = tf[token] * (idf[token] || 1);
    }
    
    chunkVectors.push({
      id: chunk.id,
      vector,
      tokens
    });
  }
  
  return { chunks, idf, chunkVectors };
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  // Get all unique keys
  const allKeys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
  
  for (const key of allKeys) {
    const v1 = vec1[key] || 0;
    const v2 = vec2[key] || 0;
    
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * BM25 score calculation
 * k1 and b are tuning parameters
 */
function bm25Score(queryTokens, chunkTokens, idf, k1 = 1.5, b = 0.75, avgDocLength = 100) {
  const docLength = chunkTokens.length;
  const tf = {};
  
  for (const token of chunkTokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  
  let score = 0;
  
  for (const queryToken of queryTokens) {
    if (tf[queryToken]) {
      const termFreq = tf[queryToken];
      const idfScore = idf[queryToken] || 0;
      
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDocLength));
      
      score += idfScore * (numerator / denominator);
    }
  }
  
  return score;
}

/**
 * Retrieve top K relevant chunks for a query
 */
function retrieveChunks(query, index, topK = 5, method = 'hybrid') {
  if (!index || !index.chunks || index.chunks.length === 0) {
    return [];
  }
  
  const queryTokens = tokenize(query);
  const queryTF = calculateTF(queryTokens);
  
  // Calculate query vector
  const queryVector = {};
  for (const token in queryTF) {
    queryVector[token] = queryTF[token] * (index.idf[token] || 1);
  }
  
  // Calculate average document length for BM25
  const avgDocLength = index.chunkVectors.reduce(
    (sum, cv) => sum + cv.tokens.length, 0
  ) / index.chunkVectors.length;
  
  // Score each chunk
  const scores = [];
  
  for (let i = 0; i < index.chunkVectors.length; i++) {
    const cv = index.chunkVectors[i];
    
    let score;
    switch (method) {
      case 'tfidf':
        score = cosineSimilarity(queryVector, cv.vector);
        break;
      case 'bm25':
        score = bm25Score(queryTokens, cv.tokens, index.idf, 1.5, 0.75, avgDocLength);
        break;
      case 'hybrid':
      default:
        const tfidfScore = cosineSimilarity(queryVector, cv.vector);
        const bm25ScoreVal = bm25Score(queryTokens, cv.tokens, index.idf, 1.5, 0.75, avgDocLength);
        score = 0.5 * tfidfScore + 0.5 * (bm25ScoreVal / (bm25ScoreVal + 1)); // Normalize BM25
        break;
    }
    
    scores.push({
      index: i,
      chunkId: cv.id,
      score
    });
  }
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  // Return top K chunks with their text
  const results = [];
  for (let i = 0; i < Math.min(topK, scores.length); i++) {
    const scoreEntry = scores[i];
    const chunk = index.chunks[scoreEntry.index];
    
    if (scoreEntry.score > 0) {
      results.push({
        id: chunk.id,
        text: chunk.text,
        score: Math.round(scoreEntry.score * 1000) / 1000
      });
    }
  }
  
  return results;
}

/**
 * Highlight matching terms in chunk text
 */
function highlightMatches(text, query) {
  const queryTokens = tokenize(query);
  let highlighted = text;
  
  for (const token of queryTokens) {
    const regex = new RegExp(`\\b(${token})\\b`, 'gi');
    highlighted = highlighted.replace(regex, '**$1**');
  }
  
  return highlighted;
}

/**
 * Extract key phrases from query for better matching
 */
function extractKeyPhrases(query) {
  const phrases = [];
  
  // Common academic query patterns
  const patterns = [
    /what is (?:the )?(.+?)(?:\?|$)/i,
    /how (?:do|does|to) (.+?)(?:\?|$)/i,
    /when is (.+?) due(?:\?|$)/i,
    /(.+?) policy/i,
    /(.+?) grade/i,
    /(.+?) weight/i
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      phrases.push(match[1].trim());
    }
  }
  
  return phrases;
}

/**
 * Enhanced retrieval with query expansion
 */
function enhancedRetrieve(query, index, topK = 5) {
  // Get key phrases
  const keyPhrases = extractKeyPhrases(query);
  
  // Retrieve for original query
  const mainResults = retrieveChunks(query, index, topK, 'hybrid');
  
  // Retrieve for key phrases and merge
  const phraseResults = [];
  for (const phrase of keyPhrases) {
    const results = retrieveChunks(phrase, index, 2, 'hybrid');
    phraseResults.push(...results);
  }
  
  // Merge and deduplicate
  const seenIds = new Set();
  const merged = [];
  
  // Add main results first
  for (const result of mainResults) {
    if (!seenIds.has(result.id)) {
      seenIds.add(result.id);
      merged.push(result);
    }
  }
  
  // Add phrase results with reduced score
  for (const result of phraseResults) {
    if (!seenIds.has(result.id) && merged.length < topK) {
      seenIds.add(result.id);
      merged.push({
        ...result,
        score: result.score * 0.8 // Reduce score for phrase matches
      });
    }
  }
  
  // Re-sort by score
  merged.sort((a, b) => b.score - a.score);
  
  return merged.slice(0, topK);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tokenize,
    calculateTF,
    calculateIDF,
    buildIndex,
    cosineSimilarity,
    bm25Score,
    retrieveChunks,
    highlightMatches,
    extractKeyPhrases,
    enhancedRetrieve
  };
}

export {
  tokenize,
  calculateTF,
  calculateIDF,
  buildIndex,
  cosineSimilarity,
  bm25Score,
  retrieveChunks,
  highlightMatches,
  extractKeyPhrases,
  enhancedRetrieve
};
