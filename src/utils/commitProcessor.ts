import { WORD_COUNT_LIMITS } from '../constants/config.js';

export async function processCommitMessage(
  rawMessage: string,
  diff: string,
  addedLines: string[],
  removedLines: string[],
  detectedChangeType?: string
): Promise<string> {
  let cleaned = rawMessage.trim();

  // Clean up garbage that the model sometimes generates
  const messageLines = cleaned.split('\n');
  cleaned = messageLines[0].trim();

  // Filter lines that are clearly garbage (git hashes, metadata, etc.)
  const isGarbage =
    cleaned.includes('---') ||
    cleaned.includes('REVIEW') ||
    cleaned.includes('COMMIT MESSAGE') ||
    cleaned.includes('Look at') ||
    cleaned.includes('Author:') ||
    cleaned.includes('Date:') ||
    cleaned.includes('author:') ||
    cleaned.includes('date:') ||
    cleaned.includes('message:') ||
    cleaned.startsWith('"type:') ||
    cleaned.startsWith('[type]') ||
    cleaned === 'commit:' ||
    /^[0-9a-f]{40}/.test(cleaned) || // SHA1 hash completo
    /^[0-9a-f]{32,40}/.test(cleaned); // SHA parcial

  if (isGarbage) {
    // Find the first valid line
    for (const line of messageLines) {
      const trimmed = line.trim();

      // Validate that it's a valid commit or at least useful text
      if (
        trimmed.match(/^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:/) ||
        (trimmed.length > 10 &&
          trimmed.length < 100 &&
          !trimmed.includes('---') &&
          !trimmed.includes('Author:') &&
          !trimmed.includes('Date:') &&
          !/^[0-9a-f]{30,}/.test(trimmed) &&
          !trimmed.startsWith('"') &&
          !trimmed.startsWith('['))
      ) {
        cleaned = trimmed;
        break;
      }
    }
  }

  // If after filtering it's still garbage, use a generic fallback
  if (/^[0-9a-f]{30,}/.test(cleaned) || cleaned.includes('Author:')) {
    cleaned = 'chore: update code';
    console.log('[Commit] Model generated garbage, using generic fallback');
  }

  const countWords = (commitMsg: string): number => {
    const match = commitMsg.match(
      /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
    );
    if (!match) return commitMsg.split(/\s+/).length;
    return match[3].trim().split(/\s+/).length;
  };

  console.log('[RocketCommit] Received detectedChangeType:', detectedChangeType);

  // More flexible regex: accepts with or without scope
  const validFormatMatch = cleaned.match(
    /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
  );

  if (validFormatMatch) {
    console.log('[RocketCommit] Model generated valid format, using directly');

    let [, currentType, scope, subject] = validFormatMatch;

    console.log(
      '[RocketCommit] Checking correction: detectedChangeType=' +
        detectedChangeType +
        ', currentType=' +
        currentType
    );

    // Force correct type based on pattern detection (only for critical cases)
    if (detectedChangeType === 'restored' && currentType !== 'fix') {
      currentType = 'fix';
      console.log('[RocketCommit] Type corrected to "fix" for restored code');
    }

    // LFM2 optimized: Trust model more, only fix obvious past tense errors
    // The improved prompt should handle imperative mood correctly
    const hasPastTenseError = /\b(added|removed|updated|changed|fixed)\b/.test(subject);
    if (hasPastTenseError) {
      console.log('[RocketCommit] Past tense detected, correcting to imperative');
      subject = subject.replace(/\b(added|removed|updated|changed|fixed)\b/g, (match) => {
        const imperativeMap: Record<string, string> = {
          added: 'add',
          removed: 'remove',
          updated: 'update',
          changed: 'change',
          fixed: 'fix',
        };
        return imperativeMap[match] || match;
      });
    }

    // Rebuild the message with corrected type and verb
    cleaned = `${currentType}${scope || ''}: ${subject}`;

    // LFM2 optimized: Only correct direction in extreme cases
    // Trust that the improved prompt makes the model more accurate
    const hasOnlyAdditions = addedLines.length > 0 && removedLines.length === 0;
    const hasOnlyRemovals = removedLines.length > 0 && addedLines.length === 0;

    const hasAddVerb = /\badd\b/i.test(cleaned);
    const hasRemoveVerb = /\bremove\b/i.test(cleaned);

    // Only correct if there's a clear contradiction
    if (hasOnlyRemovals && hasAddVerb && !hasRemoveVerb) {
      console.log('[RocketCommit] Clear contradiction: only removals but says "add"');
      cleaned = cleaned.replace(/\badd\b/g, 'remove');
    } else if (hasOnlyAdditions && hasRemoveVerb && !hasAddVerb) {
      console.log('[RocketCommit] Clear contradiction: only additions but says "remove"');
      cleaned = cleaned.replace(/\bremove\b/g, 'add');
    }
  } else {
    console.log('[RocketCommit] Model did not generate valid format, using direct response');
    console.log('[RocketCommit] Response: ', cleaned);

    // LFM2 optimized: With better prompt, this should rarely happen
    // Determine type based on pattern detection
    let defaultType = 'chore';
    if (detectedChangeType === 'restored') {
      defaultType = 'fix';
    } else if (detectedChangeType === 'refactor') {
      defaultType = 'refactor';
    }

    // Try to add type if it doesn't have one
    if (!cleaned.match(/^[a-z]+:/)) {
      cleaned = `${defaultType}: ${cleaned}`;
      console.log(`[RocketCommit] Added prefix "${defaultType}:" based on detection`);
    }

    // LFM2 optimized: Only fix past tense if present
    const hasPastTenseError = /\b(added|removed|updated|changed|fixed)\b/.test(cleaned);
    if (hasPastTenseError) {
      console.log('[RocketCommit] Past tense in fallback path, correcting');
      cleaned = cleaned.replace(/\b(added|removed|updated|changed|fixed)\b/g, (match) => {
        const imperativeMap: Record<string, string> = {
          added: 'add',
          removed: 'remove',
          updated: 'update',
          changed: 'change',
          fixed: 'fix',
        };
        return imperativeMap[match] || match;
      });
    }
  }

  let wordCount = countWords(cleaned);
  console.log('[RocketCommit] Words in message:', wordCount);

  // Only expand if it's VERY short (less than 3 words)
  // Expansion usually makes the message worse, so only use it when critical
  if (wordCount < 3) {
    cleaned = expandCommitMessage(cleaned, wordCount);
    wordCount = countWords(cleaned);
  } else if (wordCount > WORD_COUNT_LIMITS.max) {
    cleaned = truncateCommitMessage(cleaned);
    wordCount = countWords(cleaned);
  }

  console.log('[RocketCommit] Final message with', wordCount, 'words:', cleaned);

  return cleaned;
}

function expandCommitMessage(cleaned: string, _wordCount: number): string {
  const match = cleaned.match(
    /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
  );
  if (!match) return cleaned;

  const type = match[1];
  const scope = match[2] || '';
  let desc = match[3];

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
  return `${type}${scope}: ${desc}`;
}

function truncateCommitMessage(cleaned: string): string {
  const match = cleaned.match(
    /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
  );
  if (!match) return cleaned;

  const type = match[1];
  const scope = match[2] || '';
  const words = match[3].trim().split(/\s+/);
  const truncated = words.slice(0, WORD_COUNT_LIMITS.max).join(' ');
  return `${type}${scope}: ${truncated}`;
}
