import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadVectorStore } from './indexer.js';
import { retrieve, rerank, buildContext } from './retriever.js';
import { logger } from '../utils/logger.js';
import type { MvdocConfig, MvdocSecrets } from '../utils/config.js';
import { generateContent, initAI } from '../processors/ai-engine.js';

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

export async function askQuestion(
  question: string,
  docsDir: string,
  config: MvdocConfig,
  secrets: MvdocSecrets,
  options: {
    model?: string;
    history?: ChatMessage[];
    topK?: number;
  } = {}
): Promise<ChatResponse> {
  const { model = config.ai.model, history = [], topK = 5 } = options;

  const store = loadVectorStore(docsDir);
  if (!store || store.chunks.length === 0) {
    return {
      answer: 'No documentation has been indexed yet. Run `mvdoc index` first to index your docs.',
      sources: [],
    };
  }

  const provider = config.ai.provider;
  let queryVector: number[] = [];

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(secrets.geminiKey!);
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const queryEmbedding = await embeddingModel.embedContent(question);
    queryVector = queryEmbedding.embedding.values;
  } else {
    const url = `${(config.ai.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secrets.openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: question })
    });
    if (!resp.ok) throw new Error('Failed to generate embedding with OpenAI');
    const json = await resp.json() as any;
    queryVector = json.data[0].embedding;
  }

  let results = retrieve(queryVector, store, { topK });
  results = rerank(results, question);

  const context = buildContext(results);
  
  // Make sure AI engine is initialized for generateContent
  initAI(config, secrets);

  let conversation = `Context from documentation:\n---\n${context}\n---\n\n`;
  if (history.length > 0) {
    conversation += "Previous conversation:\n";
    for (const msg of history.slice(-6)) {
      conversation += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
    }
  }
  conversation += `User question: ${question}\n\nAnswer based ONLY on the context above. If the answer is not in the context, say so clearly.`;

  const answer = await generateContent(conversation, {
    systemInstruction: CHAT_SYSTEM_PROMPT,
    temperature: 0.3,
  });

  const sources = results.map((r) => ({
    file: r.chunk.metadata.source,
    section: r.chunk.metadata.section,
    score: Math.round(r.score * 100) / 100,
  }));

  return { answer, sources };
}

export async function startCLIChat(
  docsDir: string,
  config: MvdocConfig,
  secrets: MvdocSecrets
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
        const response = await askQuestion(question, docsDir, config, secrets, {
          model: config.ai.model,
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
