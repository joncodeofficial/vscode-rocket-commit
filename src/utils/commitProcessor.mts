import { WORD_COUNT_LIMITS } from '../constants/config.js';

export async function processCommitMessage(
  rawMessage: string,
  diff: string,
  addedLines: string[],
  removedLines: string[],
  detectedChangeType?: string
): Promise<string> {
  let cleaned = rawMessage.trim();

  // Limpiar basura que el modelo a veces genera
  const messageLines = cleaned.split('\n');
  cleaned = messageLines[0].trim();

  // Filtrar líneas que son claramente basura (git hashes, metadata, etc.)
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
    // Buscar la primera línea válida
    for (const line of messageLines) {
      const trimmed = line.trim();

      // Validar que sea un commit válido o al menos texto útil
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

  // Si después del filtrado sigue siendo basura, usar un fallback genérico
  if (/^[0-9a-f]{30,}/.test(cleaned) || cleaned.includes('Author:')) {
    cleaned = 'chore: update code';
    console.log('[LibreCommit] ⚠️ Modelo generó basura, usando fallback genérico');
  }

  const countWords = (commitMsg: string): number => {
    const match = commitMsg.match(
      /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
    );
    if (!match) return commitMsg.split(/\s+/).length;
    return match[3].trim().split(/\s+/).length;
  };

  console.log('[LibreCommit] 📥 Received detectedChangeType:', detectedChangeType);

  // Regex más flexible: acepta con o sin scope
  const validFormatMatch = cleaned.match(
    /^(feat|fix|docs|style|refactor|test|chore|perf)(\([^)]+\))?:\s*(.+)$/
  );

  if (validFormatMatch) {
    console.log('[LibreCommit] Modelo generó formato válido, usando directamente');

    let [, currentType, scope, subject] = validFormatMatch;

    console.log(
      '[LibreCommit] 🔍 Checking correction: detectedChangeType=' +
        detectedChangeType +
        ', currentType=' +
        currentType
    );

    // Forzar tipo correcto basado en detección de patrones
    if (detectedChangeType === 'restored' && currentType !== 'fix') {
      currentType = 'fix';
      console.log('[LibreCommit] ✅ Tipo corregido a "fix" para código restaurado');
    }

    // Corregir verbo imperativo
    subject = subject.replace(/\b(added|removed|updated|changed)\b/g, (match) => {
      const imperativeMap: Record<string, string> = {
        added: 'add',
        removed: 'remove',
        updated: 'update',
        changed: 'change',
      };
      return imperativeMap[match] || match;
    });

    // Reconstruir el mensaje con tipo y verbo corregidos
    cleaned = `${currentType}${scope || ''}: ${subject}`;

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
    console.log('[LibreCommit] ⚠️ Modelo no generó formato válido, usando respuesta directa');
    console.log('[LibreCommit] Respuesta: ', cleaned);

    // Determinar tipo basado en detección de patrones
    let defaultType = 'chore';
    if (detectedChangeType === 'restored') {
      defaultType = 'fix';
    } else if (detectedChangeType === 'refactor') {
      defaultType = 'refactor';
    }

    // Intentar agregar tipo si no tiene
    if (!cleaned.match(/^[a-z]+:/)) {
      cleaned = `${defaultType}: ${cleaned}`;
      console.log(`[LibreCommit] Agregado prefijo "${defaultType}:" basado en detección`);
    }

    // Corregir verbo imperativo
    cleaned = cleaned.replace(/\b(added|removed|updated|changed)\b/g, (match) => {
      const imperativeMap: Record<string, string> = {
        added: 'add',
        removed: 'remove',
        updated: 'update',
        changed: 'change',
      };
      return imperativeMap[match] || match;
    });
  }

  let wordCount = countWords(cleaned);
  console.log('[LibreCommit] Palabras en el mensaje:', wordCount);

  // Solo expandir si está MUY corto (menos de 3 palabras)
  // La expansión suele empeorar el mensaje, así que solo usarla cuando sea crítico
  if (wordCount < 3) {
    cleaned = expandCommitMessage(cleaned, wordCount);
    wordCount = countWords(cleaned);
  } else if (wordCount > WORD_COUNT_LIMITS.max) {
    cleaned = truncateCommitMessage(cleaned);
    wordCount = countWords(cleaned);
  }

  console.log('[LibreCommit] Mensaje final con', wordCount, 'palabras:', cleaned);

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
