import { DIFF_CONFIG } from '../constants/config.js';

export function buildCommitPrompt(diff: string): {
  prompt: string;
  addedLines: string[];
  removedLines: string[];
  changeType: string;
} {
  const diffLines = diff.split('\n');

  const fileChanges: string[] = [];
  const relevantLines: string[] = [];
  const addedLines: string[] = [];
  const removedLines: string[] = [];

  for (const line of diffLines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*?) b\/(.*?)$/);
      if (match) fileChanges.push(match[2] || match[1]);
    } else if (
      (line.startsWith('+') || line.startsWith('-')) &&
      !line.startsWith('+++') &&
      !line.startsWith('---')
    ) {
      const trimmedLine = line.substring(1).trim();

      // Filtrar ruido: líneas vacías, brackets solos, comentarios simples
      const isNoise =
        trimmedLine === '' ||
        trimmedLine === '{' ||
        trimmedLine === '}' ||
        trimmedLine === '};' ||
        trimmedLine === ');' ||
        trimmedLine === '(' ||
        trimmedLine.match(/^\/\/\s*$/) || // Solo "//"
        trimmedLine.match(/^\/\/\s{0,3}$/); // "//   "

      if (!isNoise) {
        relevantLines.push(line);
        if (line.startsWith('+')) {
          addedLines.push(line);
        } else if (line.startsWith('-')) {
          removedLines.push(line);
        }
      }
    }
  }

  const fileSummary = fileChanges.join(', ');
  const changesSummary = relevantLines.slice(0, DIFF_CONFIG.maxLines).join('\n');

  // Detectar cambios numéricos
  const numericChanges: string[] = [];
  for (let i = 0; i < relevantLines.length; i++) {
    const line = relevantLines[i];
    if (
      line.startsWith('-') &&
      i + 1 < relevantLines.length &&
      relevantLines[i + 1].startsWith('+')
    ) {
      const removedMatch = line.match(/(\d+)/g);
      const addedMatch = relevantLines[i + 1].match(/(\d+)/g);
      if (removedMatch && addedMatch) {
        numericChanges.push(`${removedMatch.join(', ')} → ${addedMatch.join(', ')}`);
      }
    }
  }

  const contextHint =
    numericChanges.length > 0 ? `\nNumeric changes: ${numericChanges.join('; ')}` : '';

  const compactDiff = `Files: ${fileSummary}\n\nChanges:\n${changesSummary}${contextHint}`;

  const truncatedDiff =
    compactDiff.length > DIFF_CONFIG.maxDiffLength
      ? compactDiff.substring(0, DIFF_CONFIG.maxDiffLength) + '\n...(more changes)'
      : compactDiff;

  // Detectar si se está descomentando código (restaurando funcionalidad)
  const isUncommenting =
    removedLines.some((line) => line.trim().startsWith('-//')) &&
    addedLines.some((line) => !line.trim().startsWith('+//'));

  // Detectar refactorización (código viejo comentado + nuevo código + nuevos imports)
  const hasCommentedOldCode = addedLines.some(
    (l) => l.includes('// import') || l.includes('// const') || l.includes('// function')
  );
  const hasNewImports = addedLines.some((l) => l.includes('+import') || l.includes('+ import'));
  const hasFunctionRewrite = addedLines.length > 10 && removedLines.length > 10;

  let changeType = 'modified';

  if (isUncommenting) {
    changeType = 'restored';
    console.log('[RocketCommit] Detected UNCOMMENT pattern - changeType=restored');
  } else if (hasCommentedOldCode && hasNewImports && hasFunctionRewrite) {
    changeType = 'refactor';
  } else if (addedLines.length > removedLines.length * 2) {
    changeType = 'added';
  } else if (removedLines.length > addedLines.length * 2) {
    changeType = 'removed';
  }

  console.log('[RocketCommit] Final changeType:', changeType);

  const prompt = `You are a commit message generator. Write descriptive conventional commit messages between 7-12 words.

Rules:
- Use types: feat, fix, refactor, style, chore, perf, docs, test
- When numbers change (array sizes, counts), use "perf:" and mention FROM → TO
- "+" means ADDED, "-" means REMOVED - be accurate!
- Describe ONLY what changed, don't invent why or intentions
- For console.log/debug: use "chore:" or "debug:" and say "for debugging"
- No parentheses/scopes, format: "type: descriptive message"

Examples:

diff --git a/src/Scene.jsx b/src/Scene.jsx
-  new Float32Array(1000)
+  new Float32Array(300)
commit: perf: reduce float array size from 1000 to 300 items

diff --git a/package.json b/package.json
+  "packageManager": "pnpm@9.0.0"
-    "dev": "vite --open"
+    "dev": "vite"
commit: chore: add pnpm package manager and remove vite open flag

diff --git a/src/App.jsx b/src/App.jsx
+  console.log('debug message');
commit: chore: add temporary console log statement for debugging purposes

diff --git a/src/Button.tsx b/src/Button.tsx
-  const iconSize = 20;
+  const iconSize = 16;
commit: perf: reduce icon size from 20 to 16 pixels

diff --git a/index.html b/index.html
-  <meta name="apple-mobile-web-app-capable" content="yes">
commit: refactor: remove apple mobile web app capable meta tag

diff --git a/src/api/users.ts b/src/api/users.ts
+  async function fetchUserById(id: string) {
+    return await fetch(\`/api/users/\${id}\`);
+  }
commit: feat: add async function to fetch user data by id

diff --git a/src/services/viewer.ts b/src/services/viewer.ts
-// export async function loadModelViewable(
-//   viewer: Autodesk.Viewing.Viewer3D,
+export async function loadModelViewable(
+  viewer: Autodesk.Viewing.Viewer3D,
commit: fix: restore loadModelViewable function for caching documents

Now generate a commit for this diff (${changeType}):

Files: ${fileSummary}

Changes:
${changesSummary}

commit:`;

  console.log(
    '[RocketCommit] Diff truncado (primeros 500 chars):',
    truncatedDiff.substring(0, 500)
  );
  console.log('[RocketCommit] Files detectados:', fileChanges);

  return { prompt, addedLines, removedLines, changeType };
}
