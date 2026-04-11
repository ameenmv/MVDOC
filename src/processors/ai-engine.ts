import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

/**
 * AI Engine — Gemini API Wrapper
 * Handles all LLM interactions with rate limiting and retry logic
 */

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Initialize the AI engine with an API key and model name
 */
export function initAI(apiKey: string, modelName: string = 'gemini-2.0-flash'): void {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: modelName });
  logger.debug(`AI engine initialized with model: ${modelName}`);
}

/**
 * Generate content from a prompt with context
 */
export async function generateContent(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
    retries?: number;
  } = {}
): Promise<string> {
  if (!model || !genAI) {
    throw new Error('AI engine not initialized. Call initAI() first.');
  }

  const {
    systemInstruction,
    temperature = 0.3,
    maxTokens = 8192,
    retries = 3,
  } = options;

  // Create a model with custom config if needed
  const activeModel = systemInstruction
    ? genAI.getGenerativeModel({
        model: model.model || 'gemini-2.0-flash',
        systemInstruction,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      })
    : model;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await activeModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('Empty response from AI');
      }

      return text.trim();
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('429');
      const isRetryable = isRateLimit || err?.status === 503;

      if (!isRetryable) {
        throw err;
      }

      if (attempt < retries) {
        // Exponential backoff for rate limits (free tier is strict, so we wait longer)
        // 10s, 20s, 40s
        const delay = Math.pow(2, attempt) * 5000;
        logger.debug(`Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt}/${retries})...`);
        await sleep(delay);
        continue;
      }

      logger.error(`AI generation failed after ${retries} attempts`);
      throw err;
    }
  }

  throw new Error('Unreachable');
}

/**
 * Generate content with structured JSON output
 */
export async function generateJSON<T>(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
  } = {}
): Promise<T> {
  const jsonPrompt = `${prompt}

IMPORTANT: Respond with ONLY valid JSON. No markdown, no code fences, no explanations.`;

  const result = await generateContent(jsonPrompt, {
    ...options,
    temperature: options.temperature ?? 0.2, // Lower temp for structured output
  });

  // Strip markdown code fences if present
  let cleaned = result
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.debug(`Failed to parse AI JSON response: ${cleaned.substring(0, 200)}...`);
    throw new Error(`AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Generate content in streaming mode (for long outputs)
 */
export async function generateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  if (!model || !genAI) {
    throw new Error('AI engine not initialized. Call initAI() first.');
  }

  const { systemInstruction, temperature = 0.3, maxTokens = 8192 } = options;

  const activeModel = systemInstruction
    ? genAI.getGenerativeModel({
        model: model.model || 'gemini-2.0-flash',
        systemInstruction,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      })
    : model;

  const result = await activeModel.generateContentStream(prompt);

  let fullText = '';
  for await (const chunk of result.stream) {
    const text = chunk.text();
    fullText += text;
    onChunk(text);
  }

  return fullText.trim();
}

// ─── Utilities ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estimate token count for a text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within a token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n\n[... truncated for token limit]';
}
