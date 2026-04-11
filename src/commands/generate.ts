import { Command } from 'commander';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfig, loadSecrets, type MvdocConfig, type MvdocSecrets } from '../utils/config.js';
import { initAI } from '../processors/ai-engine.js';
import { fetchStories, fetchEpics, fetchSprints } from '../aggregators/jira.js';
import { getRepoTree, getFilesContent, filterSourceFiles, getCommitHistory } from '../aggregators/github.js';
import { scanLocalProject } from '../aggregators/local.js';
import { processStories, generateStorySummary } from '../processors/story-processor.js';
import { generateAllDiagrams, generateModuleFlowDiagram } from '../processors/diagram-generator.js';
import { generateAllDocs } from '../processors/doc-generator.js';
import type { AggregatedData, SourceFile, TechnicalSpec, DiagramOutput } from '../types.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate documentation from Jira stories, GitHub code, and AI analysis')
    .option('--source <sources>', 'Data sources to use (comma-separated: jira,github,local)', 'all')
    .option('--skip-diagrams', 'Skip diagram generation', false)
    .option('--skip-ai', 'Skip AI processing (use raw data only)', false)
    .option('--dry-run', 'Preview what would be generated without writing files', false)
    .action(async (options) => {
      try {
        await runGenerate(options);
      } catch (err) {
        logger.error('Generation failed', err);
        process.exit(1);
      }
    });
}

async function runGenerate(options: {
  source: string;
  skipDiagrams: boolean;
  skipAi: boolean;
  dryRun: boolean;
}): Promise<void> {
  logger.banner();
  logger.header('📄 Generating Documentation');

  // 1. Load config & secrets
  const config = loadConfig();
  const secrets = loadSecrets();
  const outputDir = path.resolve(config.output.dir);

  // Determine which sources to use
  const sources = options.source === 'all'
    ? ['jira', 'github', 'local']
    : options.source.split(',').map((s) => s.trim());

  logger.info(`Sources: ${sources.join(', ')}`);
  logger.info(`Output: ${outputDir}`);
  logger.info(`AI: ${options.skipAi ? 'disabled' : config.ai.model}`);
  logger.blank();

  // 2. Initialize AI engine
  if (!options.skipAi) {
    if (!secrets.geminiKey) {
      logger.error('Gemini API key not found. Set MVDOC_GEMINI_KEY in .env');
      process.exit(1);
    }
    initAI(secrets.geminiKey, config.ai.model);
    logger.success('AI engine initialized');
  }

  // 3. Aggregate data from all sources
  logger.subheader('Step 1: Data Aggregation');
  const data = await aggregateData(config, secrets, sources);

  if (options.dryRun) {
    printDryRun(data);
    return;
  }

  // 4. AI Processing
  let specs: TechnicalSpec[] = [];
  let diagrams: DiagramOutput[] = [];

  if (!options.skipAi) {
    logger.subheader('Step 2: AI Processing');

    // Process stories into specs
    if (data.jira && data.jira.stories.length > 0) {
      specs = await processStories(data.jira.stories, data.jira.epics);
    }

    // Generate diagrams
    if (!options.skipDiagrams) {
      logger.subheader('Step 3: Diagram Generation');

      const sourceFiles = data.local?.sourceFiles || [];
      diagrams = await generateAllDiagrams(data, specs, sourceFiles);

      // Generate module-level flow diagrams
      if (sourceFiles.length > 0) {
        const moduleGroups = groupByModule(sourceFiles);
        for (const [moduleName, files] of moduleGroups) {
          if (files.length >= 2) {
            try {
              const moduleDiagram = await generateModuleFlowDiagram(moduleName, files);
              diagrams.push(moduleDiagram);
            } catch {
              logger.debug(`Skipped flow diagram for module: ${moduleName}`);
            }
          }
        }
      }
    }
  }

  // 5. Generate documentation
  logger.subheader(`Step ${options.skipAi ? '2' : '4'}: Documentation Generation`);
  const pages = await generateAllDocs(data, specs, diagrams, outputDir);

  // 6. Summary
  logger.blank();
  logger.header('✅ Generation Complete');
  logger.table({
    'Pages Generated': String(pages.length),
    'Diagrams': String(diagrams.length),
    'Stories Processed': String(specs.length),
    'Output Directory': outputDir,
  });
  logger.blank();
  logger.info('Run `mvdoc serve` to preview your documentation');
}

async function aggregateData(
  config: MvdocConfig,
  secrets: MvdocSecrets,
  sources: string[]
): Promise<AggregatedData> {
  const data: AggregatedData = {
    project: {
      name: config.project.name,
      description: config.project.description || '',
    },
    jira: null,
    github: null,
    local: null,
  };

  // Jira
  if (sources.includes('jira') && config.sources.jira) {
    try {
      const stories = await fetchStories(config.sources.jira, secrets);
      const epics = await fetchEpics(config.sources.jira, secrets, stories);
      const sprints = await fetchSprints(config.sources.jira, secrets, stories);
      data.jira = { stories, epics, sprints };
    } catch (err) {
      logger.warn(`Jira aggregation failed: ${err instanceof Error ? err.message : String(err)}`);
      logger.info('Continuing without Jira data...');
    }
  } else if (sources.includes('jira')) {
    logger.warn('Jira not configured in .mvdocrc.json — skipping');
  }

  // GitHub
  if (sources.includes('github') && config.sources.github) {
    try {
      const structure = await getRepoTree(config.sources.github, secrets);
      const commits = await getCommitHistory(config.sources.github, secrets, { maxCount: 30 });

      // Fetch key source file contents for AI analysis
      const sourceTreeFiles = filterSourceFiles(structure.tree, { maxFiles: 50 });
      const filePaths = sourceTreeFiles.map((f) => f.path);
      const contents = await getFilesContent(config.sources.github, secrets, filePaths);

      data.github = { structure, commits };

      // If local is not configured, populate local data from GitHub
      if (!data.local) {
        data.local = {
          name: config.project.name,
          type: 'unknown',
          dependencies: {},
          devDependencies: {},
          scripts: {},
          directories: structure.tree.filter((f) => f.type === 'tree').map((f) => f.path),
          sourceFiles: Array.from(contents.entries()).map(([filePath, content]) => ({
            path: filePath,
            relativePath: filePath,
            language: getLanguageFromPath(filePath),
            content,
            size: content.length,
          })),
        };
      }
    } catch (err) {
      logger.warn(`GitHub aggregation failed: ${err instanceof Error ? err.message : String(err)}`);
      logger.info('Continuing without GitHub data...');
    }
  } else if (sources.includes('github')) {
    logger.warn('GitHub not configured in .mvdocrc.json — skipping');
  }

  // Local
  if (sources.includes('local') && config.sources.local) {
    try {
      data.local = await scanLocalProject(config.sources.local);
    } catch (err) {
      logger.warn(`Local scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Summary
  logger.blank();
  logger.success('Data aggregation complete:');
  logger.table({
    'Jira Stories': data.jira ? String(data.jira.stories.length) : 'N/A',
    'Jira Epics': data.jira ? String(data.jira.epics.length) : 'N/A',
    'GitHub Files': data.github ? String(data.github.structure.tree.length) : 'N/A',
    'Local Files': data.local ? String(data.local.sourceFiles.length) : 'N/A',
  });

  return data;
}

function printDryRun(data: AggregatedData): void {
  logger.header('🔍 Dry Run — Preview');

  if (data.jira) {
    logger.subheader('Jira Stories');
    for (const story of data.jira.stories.slice(0, 10)) {
      console.log(`  [${story.key}] ${story.summary} (${story.status})`);
    }
    if (data.jira.stories.length > 10) {
      console.log(`  ... and ${data.jira.stories.length - 10} more`);
    }
  }

  if (data.local) {
    logger.subheader('Source Files');
    for (const file of data.local.sourceFiles.slice(0, 15)) {
      console.log(`  ${file.relativePath} (${file.language})`);
    }
  }

  logger.blank();
  logger.info('Run without --dry-run to generate documentation.');
}

// ─── Helpers ───

function groupByModule(files: SourceFile[]): Map<string, SourceFile[]> {
  const groups = new Map<string, SourceFile[]>();
  for (const file of files) {
    const parts = file.relativePath.split('/');
    const moduleName = parts.length > 1 ? parts[0] : 'root';
    if (!groups.has(moduleName)) groups.set(moduleName, []);
    groups.get(moduleName)!.push(file);
  }
  return groups;
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    vue: 'vue', py: 'python', go: 'go', java: 'java', rb: 'ruby',
    php: 'php', css: 'css', html: 'html', json: 'json', md: 'markdown',
  };
  return map[ext] || 'text';
}
