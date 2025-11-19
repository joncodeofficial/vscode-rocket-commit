import { WORD_COUNT_LIMITS } from '../constants/config.mjs';

export async function processCommitMessage(
  rawMessage: string,
  diff: string,
  addedLines: string[],
  removedLines: string[]
): Promise<string> {
  let cleaned = rawMessage.trim();

  const messageLines = cleaned.split('\n');
  cleaned = messageLines[0].trim();

  const countWords = (commitMsg: string): number => {
    const match = commitMsg.match(/^(feat|fix|docs|style|refactor|test|chore|perf):\s*(.+)$/);
    if (!match) return commitMsg.split(/\s+/).length;
    return match[2].trim().split(/\s+/).length;
  };

  if (cleaned.match(/^(feat|fix|docs|style|refactor|test|chore|perf):/)) {
    console.log('[LibreCommit] Modelo generó formato válido, usando directamente');

    const hasOnlyAdditions = addedLines.length > 0 && removedLines.length === 0;
    const hasOnlyRemovals = removedLines.length > 0 && addedLines.length === 0;

    if (hasOnlyRemovals && cleaned.includes('add ') && !cleaned.includes('remove')) {
      cleaned = cleaned.replace(/\badd\b/g, 'remove');
      console.log('[LibreCommit] Corregido: add → remove');
    } else if (hasOnlyAdditions && cleaned.includes('remove ') && !cleaned.includes('add')) {
      cleaned = cleaned.replace(/\bremove\b/g, 'add');
      console.log('[LibreCommit] Corregido: remove → add');
    }
  } else {
    console.log('[LibreCommit] Modelo no generó formato válido, usando fallback simple');
    cleaned = generateFallbackCommit(diff, addedLines, removedLines);
  }

  let wordCount = countWords(cleaned);
  console.log('[LibreCommit] Palabras en el mensaje:', wordCount);

  if (wordCount < WORD_COUNT_LIMITS.min) {
    cleaned = expandCommitMessage(cleaned, wordCount);
    wordCount = countWords(cleaned);
  }

  if (wordCount > WORD_COUNT_LIMITS.max) {
    cleaned = truncateCommitMessage(cleaned);
    wordCount = countWords(cleaned);
  }

  console.log('[LibreCommit] Mensaje final con', wordCount, 'palabras:', cleaned);

  return cleaned;
}

function generateFallbackCommit(
  diff: string,
  addedLines: string[],
  removedLines: string[]
): string {
  const hasJson = diff.includes('.json') || diff.includes('package.json');
  const hasMd = diff.includes('.md') || diff.includes('README');
  const hasHtml = diff.includes('.html');
  const hasCss = diff.includes('.css');

  let type = 'chore';
  let description = 'update files with changes to improve project functionality';

  if (hasJson) {
    type = 'chore';
    description = 'update configuration files with new project settings and dependencies';
  } else if (hasMd) {
    type = 'docs';
    description = 'update documentation files to reflect latest project changes';
  } else if (hasHtml) {
    type = 'refactor';
    description = 'update html structure and content to improve document layout';
  } else if (hasCss) {
    type = 'style';
    description = 'update stylesheet styles to improve component visual appearance';
  } else if (addedLines.length > removedLines.length * 2) {
    type = 'feat';
    description = 'add new functionality to extend application capabilities and features';
  } else if (removedLines.length > addedLines.length * 2) {
    type = 'refactor';
    description = 'remove deprecated code to simplify codebase and reduce complexity';
  } else {
    type = 'refactor';
    description = 'update implementation logic to improve code quality and maintainability';
  }

  return `${type}: ${description}`;
}

function expandCommitMessage(cleaned: string, wordCount: number): string {
  const match = cleaned.match(/^(feat|fix|docs|style|refactor|test|chore|perf):\s*(.+)$/);
  if (!match) return cleaned;

  const type = match[1];
  let desc = match[2];

  let expansion = '';

  if (desc.includes('console.log') || desc.includes('debug')) {
    expansion = 'for debugging purposes';
  } else if (desc.includes('array') || desc.includes('Float32Array')) {
    expansion = 'for better performance';
  } else if (desc.includes('size') || desc.includes('particles') || desc.includes('items')) {
    expansion = 'to optimize rendering';
  } else if (desc.includes('package manager') || desc.includes('pnpm') || desc.includes('npm')) {
    expansion = 'to project';
  } else if (desc.includes('script') && desc.includes('dev')) {
    expansion = 'in development workflow';
  } else if (desc.includes('function') || desc.includes('method')) {
    expansion = 'to codebase';
  } else if (desc.includes('import') || desc.includes('dependency')) {
    expansion = 'to dependencies';
  } else if (desc.includes('meta') || desc.includes('html')) {
    expansion = 'from document';
  } else if (desc.includes('remove') && type === 'refactor') {
    expansion = 'to simplify code';
  } else if (desc.includes('add') && type === 'feat') {
    expansion = 'to application';
  } else {
    const genericExpansions: Record<string, string> = {
      feat: 'to app',
      fix: 'in code',
      refactor: 'in codebase',
      style: 'in styles',
      chore: 'to config',
      docs: 'in docs',
      perf: 'for performance',
      test: 'in tests',
    };
    expansion = genericExpansions[type] || 'in project';
  }

  desc = `${desc} ${expansion}`;
  return `${type}: ${desc}`;
}

function truncateCommitMessage(cleaned: string): string {
  const match = cleaned.match(/^(feat|fix|docs|style|refactor|test|chore|perf):\s*(.+)$/);
  if (!match) return cleaned;

  const type = match[1];
  const words = match[2].trim().split(/\s+/);
  const truncated = words.slice(0, WORD_COUNT_LIMITS.max).join(' ');
  return `${type}: ${truncated}`;
}
