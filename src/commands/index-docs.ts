import { Command } from 'commander';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfig, loadSecrets } from '../utils/config.js';
import { exists } from '../utils/file-utils.js';
import { indexDocuments } from '../rag/indexer.js';
import { startCLIChat } from '../rag/chat.js';
import { startRAGServer } from '../rag/server.js';

export function registerIndexCommand(program: Command): void {
  program
    .command('index')
    .description('Index documentation for RAG chatbot (creates vector embeddings)')
    .option('--force', 'Force re-index all documents', false)
    .action(async (options) => {
      try {
        await runIndex(options);
      } catch (err) {
        logger.error('Indexing failed', err);
        process.exit(1);
      }
    });

  // Add a chat subcommand for CLI chatting
  program
    .command('chat')
    .description('Chat with your documentation using AI (RAG)')
    .option('--serve', 'Start a local API server for the chat widget', false)
    .option('--port <port>', 'API server port', '3456')
    .action(async (options) => {
      try {
        await runChat(options);
      } catch (err) {
        logger.error('Chat failed', err);
        process.exit(1);
      }
    });
}

async function runIndex(options: { force: boolean }): Promise<void> {
  logger.banner();
  logger.header('🔍 Indexing Documents for RAG');

  const config = loadConfig();
  const secrets = loadSecrets();
  const docsDir = path.resolve(config.output.dir);

  if (!exists(docsDir)) {
    logger.error(`Docs directory not found: ${docsDir}`);
    logger.info('Run `mvdoc generate` first.');
    process.exit(1);
  }

  if (config.ai.provider === 'gemini' && !secrets.geminiKey) {
    logger.error('Gemini API key not found. Set MVDOC_GEMINI_KEY in .env');
    process.exit(1);
  }
  if (config.ai.provider === 'openai' && !secrets.openaiKey) {
    logger.error('OpenAI API key not found. Set MVDOC_OPENAI_KEY in .env');
    process.exit(1);
  }

  const store = await indexDocuments(docsDir, config, secrets);

  logger.blank();
  logger.table({
    'Chunks Indexed': String(store.chunks.length),
    'Embedding Model': store.model,
    'Store Location': path.join(docsDir, '.mvdoc-vectors.json'),
  });
  logger.blank();
  logger.info('Run `mvdoc chat` to start chatting with your docs!');
}

async function runChat(options: { serve: boolean; port: string }): Promise<void> {
  logger.banner();

  const config = loadConfig();
  const secrets = loadSecrets();
  const docsDir = path.resolve(config.output.dir);

  if (config.ai.provider === 'gemini' && !secrets.geminiKey) {
    logger.error('Gemini API key not found. Set MVDOC_GEMINI_KEY in .env');
    process.exit(1);
  }
  if (config.ai.provider === 'openai' && !secrets.openaiKey) {
    logger.error('OpenAI API key not found. Set MVDOC_OPENAI_KEY in .env');
    process.exit(1);
  }

  if (options.serve) {
    // Start API server mode
    logger.header('🌐 Starting RAG Chat Server');
    startRAGServer(docsDir, config, secrets, parseInt(options.port));
  } else {
    // Interactive CLI chat
    await startCLIChat(docsDir, config, secrets);
  }
}
