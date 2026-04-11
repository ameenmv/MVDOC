import { generateContent } from './ai-engine.js';
import { logger } from '../utils/logger.js';
import type { JiraStory, JiraEpic, TechnicalSpec } from '../types.js';

/**
 * Story Processor
 * Converts Jira user stories into technical specifications using AI
 */

/**
 * Process a list of stories into technical specs
 */
export async function processStories(
  stories: JiraStory[],
  epics: JiraEpic[]
): Promise<TechnicalSpec[]> {
  const spinner = logger.spinner('Processing user stories with AI...');
  const specs: TechnicalSpec[] = [];

  // Process in batches to avoid rate limits
  const batchSize = 5;

  for (let i = 0; i < stories.length; i += batchSize) {
    const batch = stories.slice(i, i + batchSize);
    spinner.text = `Processing stories ${i + 1}–${Math.min(i + batchSize, stories.length)} of ${stories.length}...`;

    const batchResults = await Promise.all(
      batch.map((story) => processOneStory(story, epics))
    );

    specs.push(...batchResults);

    // Small delay between batches
    if (i + batchSize < stories.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  spinner.succeed(`Processed ${specs.length} stories into technical specs`);
  return specs;
}

/**
 * Process a single story into a technical specification
 */
async function processOneStory(
  story: JiraStory,
  epics: JiraEpic[]
): Promise<TechnicalSpec> {
  const epicContext = story.epic
    ? epics.find((e) => e.key === story.epic)
    : null;

  const prompt = buildStoryPrompt(story, epicContext);

  try {
    const result = await generateContent(prompt, {
      systemInstruction: STORY_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 2048,
    });

    return parseStoryResult(story, result);
  } catch (err) {
    logger.debug(`Failed to process story ${story.key}: ${err}`);

    // Return a basic spec without AI processing
    return {
      storyKey: story.key,
      storySummary: story.summary,
      specification: story.description || 'No description available.',
      dataFlow: '',
      dependencies: [],
      complexity: 'medium',
    };
  }
}

/**
 * Generate a summary of all stories grouped by epic/sprint
 */
export async function generateStorySummary(
  stories: JiraStory[],
  epics: JiraEpic[]
): Promise<string> {
  const storyList = stories
    .map((s) => `- [${s.key}] ${s.summary} (${s.status}, ${s.priority})`)
    .join('\n');

  const epicList = epics
    .map((e) => `- [${e.key}] ${e.summary} (${e.stories.length} stories)`)
    .join('\n');

  const prompt = `Analyze the following project user stories and provide a comprehensive summary.

## Epics
${epicList || 'No epics found.'}

## User Stories
${storyList}

Please provide:
1. **Project Overview** — What is this project about based on the stories?
2. **Key Features** — What are the main features being built?
3. **Status Summary** — How many stories are done, in progress, and to do?
4. **Risk Areas** — Any patterns suggesting complexity or risk?

Format your response in Markdown.`;

  return generateContent(prompt, {
    systemInstruction: 'You are a project analyst. Analyze user stories and provide actionable insights. Write in clear, professional Markdown.',
    temperature: 0.4,
    maxTokens: 4096,
  });
}

// ─── Prompts & Parsing ───

const STORY_SYSTEM_PROMPT = `You are a senior software engineer converting user stories into technical specifications.

For each story, provide:
1. A detailed technical specification
2. Data flow description (where data comes from and goes)
3. Dependencies on other components or services
4. Complexity assessment (low/medium/high)

Be concise but thorough. Use technical language.`;

function buildStoryPrompt(
  story: JiraStory,
  epic: JiraEpic | null | undefined
): string {
  let prompt = `Convert this user story into a technical specification:

**Story:** ${story.key} — ${story.summary}
**Status:** ${story.status}
**Priority:** ${story.priority}`;

  if (story.description) {
    prompt += `\n**Description:** ${story.description}`;
  }

  if (story.acceptanceCriteria) {
    prompt += `\n**Acceptance Criteria:** ${story.acceptanceCriteria}`;
  }

  if (epic) {
    prompt += `\n**Epic:** ${epic.key} — ${epic.summary}`;
  }

  if (story.subtasks.length > 0) {
    prompt += `\n**Subtasks:**\n${story.subtasks.map((st) => `  - ${st.summary} (${st.status})`).join('\n')}`;
  }

  prompt += `

Provide your response in this exact format:

SPECIFICATION:
[Technical specification here]

DATA_FLOW:
[Data flow description - where data comes from and goes]

DEPENDENCIES:
[Comma-separated list of dependencies/components]

COMPLEXITY:
[low|medium|high]`;

  return prompt;
}

function parseStoryResult(story: JiraStory, result: string): TechnicalSpec {
  const sections = {
    specification: '',
    dataFlow: '',
    dependencies: [] as string[],
    complexity: 'medium' as TechnicalSpec['complexity'],
  };

  // Parse SPECIFICATION section
  const specMatch = result.match(/SPECIFICATION:\s*\n([\s\S]*?)(?=\n\s*DATA_FLOW:|$)/i);
  if (specMatch) {
    sections.specification = specMatch[1].trim();
  }

  // Parse DATA_FLOW section
  const flowMatch = result.match(/DATA_FLOW:\s*\n([\s\S]*?)(?=\n\s*DEPENDENCIES:|$)/i);
  if (flowMatch) {
    sections.dataFlow = flowMatch[1].trim();
  }

  // Parse DEPENDENCIES section
  const depsMatch = result.match(/DEPENDENCIES:\s*\n([\s\S]*?)(?=\n\s*COMPLEXITY:|$)/i);
  if (depsMatch) {
    sections.dependencies = depsMatch[1]
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  // Parse COMPLEXITY section
  const complexMatch = result.match(/COMPLEXITY:\s*\n\s*(low|medium|high)/i);
  if (complexMatch) {
    sections.complexity = complexMatch[1].toLowerCase() as TechnicalSpec['complexity'];
  }

  return {
    storyKey: story.key,
    storySummary: story.summary,
    ...sections,
  };
}
