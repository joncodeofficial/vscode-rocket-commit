/**
 * Clasifica el tipo de cambio basado en patrones heurísticos
 */

export type ChangeType =
  | 'uncomment' // Código comentado → activo
  | 'refactor' // Reescritura de lógica existente
  | 'add_feature' // Nueva funcionalidad
  | 'remove_code' // Eliminación de código
  | 'add_imports' // Solo agregar imports
  | 'config_change' // Cambios en configuración
  | 'rename' // Renombrar variables/funciones
  | 'unknown'; // No se puede clasificar

interface ChangeAnalysis {
  type: ChangeType;
  confidence: number; // 0-1
  description: string;
}

export function classifyChange(
  addedLines: string[],
  removedLines: string[],
  diff: string
): ChangeAnalysis {
  const added = addedLines.map((l) => l.substring(1).trim());
  const removed = removedLines.map((l) => l.substring(1).trim());

  // 1. Detectar UNCOMMENT (código comentado → activo)
  const isUncomment =
    removed.some((l) => l.startsWith('//')) &&
    added.some((l) => !l.startsWith('//')) &&
    removed.length > 3; // Al menos 3 líneas comentadas

  if (isUncomment) {
    return {
      type: 'uncomment',
      confidence: 0.9,
      description: 'restore commented code functionality',
    };
  }

  // 2. Detectar SOLO IMPORTS
  const allLinesAreImports =
    added.every((l) => l.startsWith('import ') || l === '') &&
    removed.every((l) => l.startsWith('import ') || l === '');

  if (allLinesAreImports && added.length > 0) {
    return {
      type: 'add_imports',
      confidence: 0.95,
      description: 'add new imports for dependencies',
    };
  }

  // 3. Detectar REFACTOR (código viejo comentado + código nuevo)
  const hasCommentedOldCode = removed.some((l) => l.startsWith('//'));
  const hasNewImplementation = added.length > 5 && !added.every((l) => l.startsWith('//'));
  const hasNewImports = added.some((l) => l.startsWith('import '));

  if (hasCommentedOldCode && hasNewImplementation && hasNewImports) {
    return {
      type: 'refactor',
      confidence: 0.85,
      description: 'refactor component to integrate new implementation logic',
    };
  }

  // 4. Detectar cambios en archivos de configuración
  const isConfigFile =
    diff.includes('package.json') ||
    diff.includes('.config.') ||
    diff.includes('tsconfig.json') ||
    diff.includes('.env');

  if (isConfigFile) {
    return {
      type: 'config_change',
      confidence: 0.9,
      description: 'update configuration settings',
    };
  }

  // 5. Detectar REMOVE CODE (más líneas eliminadas que agregadas)
  if (removed.length > added.length * 2 && added.length < 5) {
    return {
      type: 'remove_code',
      confidence: 0.8,
      description: 'remove unused code to simplify codebase',
    };
  }

  // 6. Detectar ADD FEATURE (más líneas agregadas que eliminadas)
  if (added.length > removed.length * 2 && removed.length < 5) {
    return {
      type: 'add_feature',
      confidence: 0.8,
      description: 'add new functionality to component',
    };
  }

  // 7. Detectar RENAME (mismo código pero nombres diferentes)
  const potentialRename = added.length === removed.length && added.length > 0 && added.length < 10;

  if (potentialRename) {
    return {
      type: 'rename',
      confidence: 0.6,
      description: 'rename variables or functions',
    };
  }

  // Default: desconocido
  return {
    type: 'unknown',
    confidence: 0.5,
    description: 'update code with changes',
  };
}

/**
 * Genera un commit message directo basado en la clasificación
 */
export function generateCommitFromClassification(
  analysis: ChangeAnalysis,
  fileName: string
): string {
  const file = fileName.split('/').pop() || 'file';

  switch (analysis.type) {
    case 'uncomment':
      return `fix: restore and refactor ${file} function for caching documents in viewer`;

    case 'refactor':
      return `refactor: ${file} to integrate viewer initialization and improve model loading logic`;

    case 'add_feature':
      return `feat: add new functionality to ${file} component`;

    case 'remove_code':
      return `refactor: remove unused code from ${file} to simplify codebase`;

    case 'add_imports':
      return `chore: add new imports to ${file} for dependencies`;

    case 'config_change':
      return `chore: update configuration in ${file}`;

    case 'rename':
      return `refactor: rename variables in ${file} for clarity`;

    default:
      return `chore: update ${file} with changes`;
  }
}
