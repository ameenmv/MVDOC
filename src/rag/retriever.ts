import type { DocumentChunk, VectorStore } from './indexer.js';

/**
 * RAG Retriever
 * Performs vector similarity search against the local vector store
 */

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
}

/**
 * Search for relevant chunks using cosine similarity
 */
export function retrieve(
  query: number[],
  store: VectorStore,
  options: { topK?: number; minScore?: number; category?: string } = {}
): RetrievalResult[] {
  const { topK = 5, minScore = 0.3, category } = options;

  let candidates = store.chunks;

  // Filter by category if specified
  if (category) {
    candidates = candidates.filter((c) => c.metadata.category === category);
  }

  // Calculate cosine similarity for each chunk
  const results: RetrievalResult[] = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(query, chunk.embedding),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * Re-rank results using a simple heuristic
 * Boosts chunks that mention the query terms
 */
export function rerank(
  results: RetrievalResult[],
  queryText: string
): RetrievalResult[] {
  const queryTerms = queryText
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  return results
    .map((result) => {
      let boost = 0;
      const contentLower = result.chunk.content.toLowerCase();

      for (const term of queryTerms) {
        // Count term occurrences
        const count = (contentLower.match(new RegExp(term, 'g')) || []).length;
        boost += count * 0.02; // Small boost per occurrence
      }

      // Boost exact phrase matches more
      if (contentLower.includes(queryText.toLowerCase())) {
        boost += 0.1;
      }

      // Boost code-related chunks when query seems technical
      const technicalTerms = ['api', 'function', 'component', 'module', 'class', 'method', 'endpoint'];
      const isTechnical = queryTerms.some((t) => technicalTerms.includes(t));
      if (isTechnical && result.chunk.content.includes('```')) {
        boost += 0.05;
      }

      return {
        ...result,
        score: Math.min(result.score + boost, 1.0),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Build context string from retrieval results
 */
export function buildContext(results: RetrievalResult[], maxTokens: number = 4000): string {
  const maxChars = maxTokens * 4; // Rough token estimate
  let context = '';

  for (const result of results) {
    const chunk = result.chunk;
    const source = `[Source: ${chunk.metadata.source} > ${chunk.metadata.section}]\n`;
    const entry = `${source}${chunk.content}\n\n---\n\n`;

    if (context.length + entry.length > maxChars) break;
    context += entry;
  }

  return context;
}

// ─── Math ───

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
