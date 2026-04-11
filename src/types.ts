/**
 * Shared type definitions for mvdoc
 */

// ─── Jira Types ───

export interface JiraStory {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  epic: string | null;
  sprint: string | null;
  labels: string[];
  acceptanceCriteria: string | null;
  subtasks: JiraSubtask[];
  created: string;
  updated: string;
}

export interface JiraSubtask {
  key: string;
  summary: string;
  status: string;
}

export interface JiraEpic {
  key: string;
  summary: string;
  description: string;
  status: string;
  stories: JiraStory[];
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  stories: JiraStory[];
}

// ─── GitHub Types ───

export interface RepoFile {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface RepoStructure {
  owner: string;
  repo: string;
  branch: string;
  tree: RepoFile[];
  readme: string | null;
}

export interface RepoCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  files: string[];
}

// ─── Local Scanner Types ───

export interface ProjectInfo {
  name: string;
  type: 'vue' | 'nuxt' | 'react' | 'next' | 'node' | 'unknown';
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  directories: string[];
  sourceFiles: SourceFile[];
}

export interface SourceFile {
  path: string;
  relativePath: string;
  language: string;
  content: string;
  size: number;
}

// ─── AI Processing Types ───

export interface TechnicalSpec {
  storyKey: string;
  storySummary: string;
  specification: string;
  dataFlow: string;
  dependencies: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface DiagramOutput {
  type: 'flowchart' | 'sequence' | 'usecase' | 'er' | 'c4' | 'class';
  title: string;
  mermaidSyntax: string;
  description: string;
}

export interface ModuleDoc {
  name: string;
  path: string;
  overview: string;
  responsibilities: string[];
  dataFlow: DiagramOutput;
  dependencies: string[];
  publicApi: string;
}

// ─── Aggregated Data ───

export interface AggregatedData {
  project: {
    name: string;
    description: string;
  };
  jira: {
    stories: JiraStory[];
    epics: JiraEpic[];
    sprints: JiraSprint[];
  } | null;
  github: {
    structure: RepoStructure;
    commits: RepoCommit[];
  } | null;
  local: ProjectInfo | null;
}

// ─── Generated Docs ───

export interface GeneratedPage {
  filePath: string;
  title: string;
  content: string;
  category: 'overview' | 'module' | 'story' | 'architecture' | 'api';
}

export interface SidebarItem {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}
