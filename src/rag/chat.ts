import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadVectorStore } from './indexer.js';
import { retrieve, rerank, buildContext } from './retriever.js';
import { logger } from '../utils/logger.js';

/**
 * RAG Chat
 * Handles the query → retrieve → generate pipeline for the chatbot
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{
    file: string;
    section: string;
    score: number;
  }>;
}

/**
 * Answer a question using RAG
 */
export async function askQuestion(
  question: string,
  docsDir: string,
  apiKey: string,
  options: {
    model?: string;
    history?: ChatMessage[];
    topK?: number;
  } = {}
): Promise<ChatResponse> {
  const { model = 'gemini-2.0-flash', history = [], topK = 5 } = options;

  // 1. Load vector store
  const store = loadVectorStore(docsDir);
  if (!store || store.chunks.length === 0) {
    return {
      answer: 'No documentation has been indexed yet. Run `mvdoc index` first to index your docs.',
      sources: [],
    };
  }

  // 2. Generate query embedding
  const genAI = new GoogleGenerativeAI(apiKey);
  const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

  const queryEmbedding = await embeddingModel.embedContent(question);
  const queryVector = queryEmbedding.embedding.values;

  // 3. Retrieve relevant chunks
  let results = retrieve(queryVector, store, { topK });
  results = rerank(results, question);

  // 4. Build context
  const context = buildContext(results);

  // 5. Generate answer
  const chatModel = genAI.getGenerativeModel({
    model,
    systemInstruction: CHAT_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });

  // Build conversation with history
  const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Add history
  for (const msg of history.slice(-6)) {  // Keep last 6 messages for context
    messages.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Add current question with context
  const augmentedQuestion = `Context from documentation:
---
${context}
---

User question: ${question}

Answer based ONLY on the documentation context above. If the answer is not in the context, say so clearly.`;

  const chat = chatModel.startChat({
    history: messages,
  });

  const result = await chat.sendMessage(augmentedQuestion);
  const answer = result.response.text();

  // 6. Build sources
  const sources = results.map((r) => ({
    file: r.chunk.metadata.source,
    section: r.chunk.metadata.section,
    score: Math.round(r.score * 100) / 100,
  }));

  return { answer, sources };
}

/**
 * Interactive CLI chat (for terminal usage)
 */
export async function startCLIChat(
  docsDir: string,
  apiKey: string,
  model: string = 'gemini-2.0-flash'
): Promise<void> {
  const readline = await import('node:readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  logger.header('💬 Ask Your Docs');
  logger.info('Type your questions about the project. Type "exit" to quit.\n');

  const history: ChatMessage[] = [];

  const askLoop = (): void => {
    rl.question('You: ', async (question) => {
      if (!question || question.toLowerCase() === 'exit') {
        logger.info('Goodbye! 👋');
        rl.close();
        return;
      }

      try {
        const spinner = logger.spinner('Thinking...');
        const response = await askQuestion(question, docsDir, apiKey, {
          model,
          history,
          topK: 5,
        });
        spinner.stop();

        // Display answer
        console.log(`\n${'─'.repeat(50)}`);
        console.log(response.answer);

        // Display sources
        if (response.sources.length > 0) {
          console.log(`\n📎 Sources:`);
          for (const source of response.sources) {
            console.log(`   • ${source.file} > ${source.section} (${source.score})`);
          }
        }
        console.log(`${'─'.repeat(50)}\n`);

        // Update history
        history.push({ role: 'user', content: question });
        history.push({ role: 'assistant', content: response.answer });
      } catch (err) {
        logger.error('Failed to get answer', err);
      }

      askLoop();
    });
  };

  askLoop();
}

// ─── System Prompt ───

const CHAT_SYSTEM_PROMPT = `You are a helpful documentation assistant for a software project. Your role is to answer questions about the project based ONLY on the documentation provided as context.

Rules:
- Answer ONLY from the provided context. Never make up information.
- If the answer is not in the context, say "I couldn't find information about that in the documentation."
- Be concise and helpful.
- Use code blocks when referencing code.
- Reference the source files when relevant.
- If asked about architecture or data flow, describe it clearly.
- Format your response in Markdown for readability.`;
