import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import type { MvdocConfig, MvdocSecrets } from '../utils/config.js';

let genAI: GoogleGenerativeAI | null = null;
let geminiModel: GenerativeModel | null = null;

let aiProvider: 'gemini' | 'openai' = 'gemini';
let aiModelName: string = 'gemini-2.0-flash';
let openaiKey: string = '';
let openaiBaseUrl: string = 'https://api.openai.com/v1';
let aiDisabled: boolean = false; // set to true on auth/credits failure to skip all future calls

export function initAI(config: MvdocConfig, secrets: MvdocSecrets): void {
  aiProvider = config.ai.provider;
  aiModelName = config.ai.model;

  if (aiProvider === 'gemini') {
    if (!secrets.geminiKey) throw new Error('Gemini API key is required');
    genAI = new GoogleGenerativeAI(secrets.geminiKey);
    geminiModel = genAI.getGenerativeModel({ model: aiModelName });
  } else {
    if (!secrets.openaiKey) throw new Error('OpenAI API key is required');
    openaiKey = secrets.openaiKey;
    openaiBaseUrl = config.ai.baseUrl || 'https://api.openai.com/v1';
    // Ensure baseUrl doesn't end with a slash and includes /chat/completions safely
  }

  logger.debug(`AI engine initialized with provider: ${aiProvider}, model: ${aiModelName}`);
}

export async function generateContent(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
    retries?: number;
  } = {}
): Promise<string> {
  // If auth/credits failed previously, skip immediately
  if (aiDisabled) {
    throw new Error('AI is disabled due to auth/credits failure. Skipping.');
  }

  const retries = options.retries || 3;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (aiProvider === 'gemini') {
        return await generateWithGemini(prompt, options);
      } else {
        return await generateWithOpenAI(prompt, options);
      }
    } catch (err: any) {
      // Auth/credits errors — disable AI for all future calls
      const isAuthError = err?.status === 401 || err?.status === 403 ||
        err?.message?.includes('401') || err?.message?.includes('403') ||
        err?.message?.includes('credits') || err?.message?.includes('permission');

      if (isAuthError) {
        aiDisabled = true;
        logger.warn('⚠ AI key is invalid or has no credits — skipping all AI generation.');
        logger.info('Run `mvdoc init` to update your API key.');
        throw err;
      }

      const isRateLimit = err?.status === 429 || err?.message?.includes('429');
      const isRetryable = isRateLimit || err?.status === 503 || err?.status === 502;

      if (!isRetryable) {
        throw err;
      }

      if (attempt < retries) {
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

async function generateWithGemini(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  if (!geminiModel || !genAI) throw new Error('Gemini not initialized');

  const { systemInstruction, temperature = 0.3, maxTokens = 8192 } = options;
  const activeModel = systemInstruction
    ? genAI.getGenerativeModel({
        model: aiModelName,
        systemInstruction,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      })
    : geminiModel;

  const result = await activeModel.generateContent(prompt);
  const text = result.response.text();
  if (!text || text.trim().length === 0) throw new Error('Empty response from AI');
  return text.trim();
}

async function generateWithOpenAI(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const messages = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const url = `${openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: aiModelName,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`OpenAI API Error ${response.status}: ${errText}`);
    (err as any).status = response.status;
    throw err;
  }

  const json = await response.json() as any;
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AI');
  return text.trim();
}

export async function generateJSON<T>(
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
  } = {}
): Promise<T> {
  const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no code fences, no explanations.`;

  const result = await generateContent(jsonPrompt, {
    ...options,
    temperature: options.temperature ?? 0.2,
  });

  let cleaned = result.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.debug(`Failed to parse AI JSON response: ${cleaned.substring(0, 200)}...`);
    throw new Error(`AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function generateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  if (aiProvider === 'openai') {
    return generateStreamOpenAI(prompt, onChunk, options);
  }

  if (!geminiModel || !genAI) throw new Error('Gemini not initialized');

  const { systemInstruction, temperature = 0.3, maxTokens = 8192 } = options;
  const activeModel = systemInstruction
    ? genAI.getGenerativeModel({
        model: aiModelName,
        systemInstruction,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      })
    : geminiModel;

  const result = await activeModel.generateContentStream(prompt);
  let fullText = '';
  for await (const chunk of result.stream) {
    const text = chunk.text();
    fullText += text;
    onChunk(text);
  }
  return fullText.trim();
}

async function generateStreamOpenAI(
  prompt: string,
  onChunk: (text: string) => void,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const messages = [];
  if (options.systemInstruction) messages.push({ role: 'system', content: options.systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const url = `${openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: aiModelName,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error ${response.status}: ${errText}`);
  }

  let fullText = '';
  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line.includes('data: [DONE]')) break;
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content || '';
            fullText += content;
            onChunk(content);
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
  }

  return fullText.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n\n[... truncated for token limit]';
}
