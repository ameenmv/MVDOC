import { generateContent } from './ai-engine.js';
import { logger } from '../utils/logger.js';
import type {
  DiagramOutput,
  AggregatedData,
  SourceFile,
  JiraStory,
  TechnicalSpec,
} from '../types.js';

/**
 * Diagram Generator
 * Uses AI to generate Mermaid.js diagram syntax for various diagram types
 */

const MERMAID_SYSTEM_PROMPT = `You are a software architecture diagram expert. Generate Mermaid.js diagram syntax.

Rules:
- Output ONLY valid Mermaid.js syntax
- Do NOT include markdown code fences (\`\`\`mermaid)
- Do NOT include any explanation text before or after the diagram
- Use clear, readable labels
- Keep diagrams focused and not overly complex (max 15-20 nodes)
- Use proper Mermaid syntax for the specified diagram type`;

/**
 * Generate a system architecture diagram (C4-style)
 */
export async function generateArchitectureDiagram(
  data: AggregatedData
): Promise<DiagramOutput> {
  const spinner = logger.spinner('Generating architecture diagram...');

  try {
    const context = buildArchitectureContext(data);

    const prompt = `Generate a Mermaid flowchart TD (top-down) diagram showing the system architecture for this project:

${context}

Show the main components/modules, how they connect, and external services they interact with.
Use subgraph blocks to group related components.
Use descriptive labels on the arrows showing data flow direction.`;

    const mermaidSyntax = await generateContent(prompt, {
      systemInstruction: MERMAID_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 1024,
    });

    const validated = validateMermaid(mermaidSyntax);
    spinner.succeed('Generated architecture diagram');

    return {
      type: 'flowchart',
      title: 'System Architecture',
      mermaidSyntax: validated,
      description: 'High-level system architecture showing main components and their interactions.',
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Generate a data flow diagram for a specific module
 */
export async function generateModuleFlowDiagram(
  moduleName: string,
  sourceFiles: SourceFile[]
): Promise<DiagramOutput> {
  const filesSummary = sourceFiles
    .map((f) => `- ${f.relativePath} (${f.language})`)
    .join('\n');

  const codeSnippets = sourceFiles
    .slice(0, 3) // Limit to 3 files
    .map((f) => `### ${f.relativePath}\n\`\`\`${f.language}\n${f.content.substring(0, 400)}\n\`\`\``)
    .join('\n\n');

  const prompt = `Generate a Mermaid flowchart LR (left-to-right) diagram showing the data flow for the "${moduleName}" module.

## Files in this module:
${filesSummary}

## Code samples:
${codeSnippets}

Show:
- Where data enters the module (inputs/APIs/events)
- How data is processed/transformed
- Where data goes (outputs/database/other modules)
- Key functions/components in the flow`;

  const mermaidSyntax = await generateContent(prompt, {
    systemInstruction: MERMAID_SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 1024,
  });

  return {
    type: 'flowchart',
    title: `${moduleName} — Data Flow`,
    mermaidSyntax: validateMermaid(mermaidSyntax),
    description: `Data flow diagram showing how data moves through the ${moduleName} module.`,
  };
}

/**
 * Generate a sequence diagram for a user story/feature flow
 */
export async function generateSequenceDiagram(
  story: JiraStory,
  spec: TechnicalSpec
): Promise<DiagramOutput> {
  const prompt = `Generate a Mermaid sequence diagram for this user story:

**Story:** ${story.key} — ${story.summary}
**Description:** ${story.description || 'N/A'}
**Specification:** ${spec.specification}
**Data Flow:** ${spec.dataFlow}

Show the interaction between:
- User/Client
- Frontend components
- API/Backend
- Database/External services

Show the main happy path flow.`;

  const mermaidSyntax = await generateContent(prompt, {
    systemInstruction: MERMAID_SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 1024,
  });

  return {
    type: 'sequence',
    title: `${story.key} — Sequence Flow`,
    mermaidSyntax: validateMermaid(mermaidSyntax),
    description: `Sequence diagram for: ${story.summary}`,
  };
}

/**
 * Generate a use case diagram
 */
export async function generateUseCaseDiagram(
  stories: JiraStory[]
): Promise<DiagramOutput> {
  const storyList = stories
    .slice(0, 20) // Limit for diagram clarity
    .map((s) => `- ${s.summary} (${s.status})`)
    .join('\n');

  const prompt = `Generate a Mermaid flowchart showing a use case diagram based on these user stories:

${storyList}

Create a diagram where:
- Actor (User) is on the left
- Group related use cases in subgraph blocks by feature area
- Draw connections from the actor to the use cases
- Use descriptive, short labels

Use flowchart LR format. Represent actors as rounded boxes and use cases as regular boxes.`;

  const mermaidSyntax = await generateContent(prompt, {
    systemInstruction: MERMAID_SYSTEM_PROMPT,
    temperature: 0.3,
  });

  return {
    type: 'usecase',
    title: 'Use Cases Overview',
    mermaidSyntax: validateMermaid(mermaidSyntax),
    description: 'Use case diagram showing user interactions with the system.',
  };
}

/**
 * Generate an ER diagram from code analysis
 */
export async function generateERDiagram(
  sourceFiles: SourceFile[]
): Promise<DiagramOutput> {
  // Look for model/schema/entity files
  const modelFiles = sourceFiles.filter(
    (f) =>
      f.relativePath.includes('model') ||
      f.relativePath.includes('schema') ||
      f.relativePath.includes('entity') ||
      f.relativePath.includes('prisma') ||
      f.relativePath.includes('migration')
  );

  const codeContext = (modelFiles.length > 0 ? modelFiles : sourceFiles.slice(0, 5))
    .map(
      (f) =>
        `### ${f.relativePath}\n\`\`\`${f.language}\n${f.content.substring(0, 500)}\n\`\`\``
    )
    .join('\n\n');

  const prompt = `Generate a Mermaid erDiagram showing the data model/entity relationships for this codebase:

${codeContext}

Identify the main entities, their attributes, and relationships.
Use standard ER notation (||--o{, etc).
Include only the most important attributes (3-5 per entity).`;

  const mermaidSyntax = await generateContent(prompt, {
    systemInstruction: MERMAID_SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 1024,
  });

  return {
    type: 'er',
    title: 'Data Model',
    mermaidSyntax: validateMermaid(mermaidSyntax),
    description: 'Entity-Relationship diagram showing the data model.',
  };
}

/**
 * Generate all diagrams for a project
 */
export async function generateAllDiagrams(
  data: AggregatedData,
  specs: TechnicalSpec[],
  sourceFiles: SourceFile[]
): Promise<DiagramOutput[]> {
  const diagrams: DiagramOutput[] = [];
  const spinner = logger.spinner('Generating diagrams...');

  try {
    // 1. Architecture diagram
    spinner.text = 'Generating architecture diagram...';
    diagrams.push(await generateArchitectureDiagram(data));

    // 2. Use case diagram (if we have stories)
    if (data.jira && data.jira.stories.length > 0) {
      spinner.text = 'Generating use case diagram...';
      diagrams.push(await generateUseCaseDiagram(data.jira.stories));

      // 3. Sequence diagrams for top stories
      const topStories = data.jira.stories.slice(0, 5);
      for (const story of topStories) {
        const spec = specs.find((s) => s.storyKey === story.key);
        if (spec) {
          spinner.text = `Generating sequence diagram for ${story.key}...`;
          try {
            diagrams.push(await generateSequenceDiagram(story, spec));
          } catch {
            logger.debug(`Skipped sequence diagram for ${story.key}`);
          }
        }
      }
    }

    // 4. ER Diagram
    if (sourceFiles.length > 0) {
      spinner.text = 'Generating ER diagram...';
      try {
        diagrams.push(await generateERDiagram(sourceFiles));
      } catch {
        logger.debug('Skipped ER diagram (no model files detected)');
      }
    }

    spinner.succeed(`Generated ${diagrams.length} diagrams`);
    return diagrams;
  } catch (err) {
    spinner.fail('Diagram generation failed');
    throw err;
  }
}

// ─── Helpers ───

function buildArchitectureContext(data: AggregatedData): string {
  const parts: string[] = [];

  parts.push(`**Project:** ${data.project.name}`);
  if (data.project.description) {
    parts.push(`**Description:** ${data.project.description}`);
  }

  if (data.local) {
    parts.push(`**Type:** ${data.local.type}`);
    parts.push(`**Dependencies:** ${Object.keys(data.local.dependencies).join(', ')}`);
    parts.push(`**Directories:**\n${data.local.directories.slice(0, 20).map((d) => `  - ${d}`).join('\n')}`);
  }

  if (data.github) {
    const dirs = data.github.structure.tree
      .filter((f) => f.type === 'tree')
      .slice(0, 20)
      .map((f) => `  - ${f.path}`);
    parts.push(`**Repository Structure:**\n${dirs.join('\n')}`);
  }

  if (data.jira && data.jira.epics.length > 0) {
    parts.push(
      `**Feature Areas (Epics):**\n${data.jira.epics.map((e) => `  - ${e.summary}`).join('\n')}`
    );
  }

  return parts.join('\n\n');
}

/**
 * Validate and clean Mermaid syntax
 */
function validateMermaid(syntax: string): string {
  let cleaned = syntax.trim();

  // Remove markdown code fences if accidentally included
  cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```\s*$/i, '');

  // Ensure it starts with a valid Mermaid directive
  const validStarts = [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
    'erDiagram', 'gantt', 'pie', 'stateDiagram', 'journey',
    'gitGraph', 'mindmap', 'timeline', 'C4',
  ];

  const hasValidStart = validStarts.some(
    (s) => cleaned.startsWith(s) || cleaned.startsWith(s.toLowerCase())
  );

  if (!hasValidStart) {
    logger.debug(`Mermaid syntax may be invalid. First 100 chars: ${cleaned.substring(0, 100)}`);
  }

  return cleaned;
}
