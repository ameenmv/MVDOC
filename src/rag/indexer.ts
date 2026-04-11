import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

/**
 * RAG Indexer
 * Chunks markdown documents, generates embeddings, and stores in a local JSON-based vector store
 * (Using a simple local implementation instead of LanceDB for zero-dependency setup)
 */

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    title: string;
    section: string;
    category: string;
  };
  embedding: number[];
}

export interface VectorStore {
  chunks: DocumentChunk[];
  model: string;
  createdAt: string;
}

const STORE_FILENAME = '.mvdoc-vectors.json';

/**
 * Index all markdown files in the docs directory
 */
import type { MvdocConfig, MvdocSecrets } from '../utils/config.js';

export async function indexDocuments(
  docsDir: string,
  config: MvdocConfig,
  secrets: MvdocSecrets
): Promise<VectorStore> {
  const spinner = logger.spinner('Indexing documents for RAG...');

  try {
    const mdFiles = findMarkdownFiles(docsDir);
    spinner.text = `Found ${mdFiles.length} markdown files...`;

    const rawChunks = chunkDocuments(mdFiles, docsDir);
    spinner.text = `Created ${rawChunks.length} chunks...`;

    const provider = config.ai.provider;
    let geminiEmbeddingModel: any = null;
    let openaiKey = '';
    let openaiBaseUrl = '';

    if (provider === 'gemini') {
      if (!secrets.geminiKey) throw new Error('Gemini API key is required');
      const genAI = new GoogleGenerativeAI(secrets.geminiKey);
      geminiEmbeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    } else {
      if (!secrets.openaiKey) throw new Error('OpenAI API key is required');
      openaiKey = secrets.openaiKey;
      openaiBaseUrl = config.ai.baseUrl || 'https://api.openai.com/v1';
    }

    const chunks: DocumentChunk[] = [];
    const batchSize = provider === 'gemini' ? 5 : 20;

    for (let i = 0; i < rawChunks.length; i += batchSize) {
      const batch = rawChunks.slice(i, i + batchSize);
      spinner.text = `Generating embeddings ${i + 1}–${Math.min(i + batchSize, rawChunks.length)} of ${rawChunks.length}...`;

      if (provider === 'openai') {
        const inputs = batch.map(c => c.content);
        const url = `${openaiBaseUrl.replace(/\/$/, '')}/embeddings`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: inputs
          })
        });
        if (resp.ok) {
          const json = await resp.json() as any;
          batch.forEach((chunk, j) => {
            if (json.data[j]?.embedding) {
              chunks.push({ ...chunk, embedding: json.data[j].embedding });
            }
          });
        }
      } else {
        const embeddings = await Promise.all(
          batch.map(async (chunk) => {
            try {
              const result = await geminiEmbeddingModel.embedContent(chunk.content);
              return result.embedding.values;
            } catch {
              return [] as number[];
            }
          })
        );
        for (let j = 0; j < batch.length; j++) {
          if (embeddings[j].length > 0) chunks.push({ ...batch[j], embedding: embeddings[j] });
        }
      }

      if (i + batchSize < rawChunks.length) await new Promise((r) => setTimeout(r, 200));
    }

    const store: VectorStore = {
      chunks,
      model: provider === 'gemini' ? 'text-embedding-004' : 'text-embedding-3-small',
      createdAt: new Date().toISOString(),
    };

    const storePath = path.join(docsDir, STORE_FILENAME);
    fs.writeFileSync(storePath, JSON.stringify(store), 'utf-8');

    spinner.succeed(`Indexed ${chunks.length} chunks from ${mdFiles.length} files`);
    return store;
  } catch (err) {
    spinner.fail('Indexing failed');
    throw err;
  }
}

/**
 * Load an existing vector store
 */
export function loadVectorStore(docsDir: string): VectorStore | null {
  const storePath = path.join(docsDir, STORE_FILENAME);

  if (!fs.existsSync(storePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(storePath, 'utf-8');
    return JSON.parse(data) as VectorStore;
  } catch {
    return null;
  }
}

// ─── Document Chunking ───

interface RawChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    title: string;
    section: string;
    category: string;
  };
}

/**
 * Find all markdown files in a directory recursively
 */
function findMarkdownFiles(dirPath: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden and special directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Chunk markdown documents by sections (headers)
 */
function chunkDocuments(files: string[], docsDir: string): RawChunk[] {
  const chunks: RawChunk[] = [];
  let chunkId = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(docsDir, filePath);

    // Determine category from path
    let category = 'general';
    if (relativePath.includes('stories')) category = 'story';
    else if (relativePath.includes('modules')) category = 'module';
    else if (relativePath.includes('architecture')) category = 'architecture';

    // Extract title from frontmatter or first heading
    const title = extractTitle(content, relativePath);

    // Split by headers
    const sections = splitByHeaders(content);

    for (const section of sections) {
      if (section.content.trim().length < 50) continue; // Skip tiny sections

      // Further split if section is too large (> 1500 chars)
      const subChunks = splitLargeSection(section.content, 1500);

      for (const subChunk of subChunks) {
        chunks.push({
          id: `chunk-${chunkId++}`,
          content: subChunk,
          metadata: {
            source: relativePath,
            title,
            section: section.heading || title,
            category,
          },
        });
      }
    }
  }

  return chunks;
}

interface Section {
  heading: string;
  content: string;
}

function splitByHeaders(content: string): Section[] {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/m, '');

  const lines = withoutFrontmatter.split('\n');
  const sections: Section[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);

    if (headingMatch) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }

      currentHeading = headingMatch[1];
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

function splitLargeSection(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let current = '';

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += paragraph + '\n\n';
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

function extractTitle(content: string, filePath: string): string {
  // Try frontmatter title
  const fmMatch = content.match(/^---[\s\S]*?title:\s*"?([^"\n]+)"?[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1].trim();

  // Try first H1
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();

  // Fallback to filename
  return path.basename(filePath, '.md');
}
