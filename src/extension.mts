import * as vscode from 'vscode';
import { getLlama, LlamaContext, LlamaModel, LlamaCompletion } from 'node-llama-cpp';
import { createServer, Server } from 'http';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MODEL_URL =
  'https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Q4_K_M.gguf';

let model: LlamaModel | null = null;
let context: LlamaContext | null = null;
let contextSequence: any = null; // Secuencia reutilizable
let httpServer: Server | null = null;
let modelDir: string;
let modelPath: string;

async function downloadModel(
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  progress.report({ message: 'Descargando Qwen2.5-Coder 0.5B Base Q4_K_M (~400 MB)...' });

  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true });
  }

  console.log('[LibreCommit] Iniciando descarga del modelo desde:', MODEL_URL);

  const response = await fetch(MODEL_URL);

  if (!response.ok) {
    throw new Error(`Error al descargar: ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let downloadedBytes = 0;

  console.log('[LibreCommit] Tamaño del modelo:', (totalBytes / 1024 / 1024).toFixed(2), 'MB');

  const reader = response.body!.getReader();
  const writer = createWriteStream(modelPath);

  // Esperar a que el stream termine correctamente
  await new Promise<void>((resolve, reject) => {
    writer.on('error', reject);
    writer.on('finish', resolve);

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          downloadedBytes += value.length;
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
          const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

          progress.report({
            message: `Descargando: ${mb}/${totalMB} MB (${percent}%)`,
            increment: (value.length / totalBytes) * 100,
          });

          writer.write(value);
        }
        writer.end();
      } catch (error) {
        writer.destroy();
        reject(error);
      }
    })();
  });

  console.log('[LibreCommit] Descarga completada. Archivo guardado en:', modelPath);
  progress.report({ message: 'Descarga completada!' });
}

async function initModel(): Promise<void> {
  if (!existsSync(modelPath)) {
    console.log('[LibreCommit] Modelo no encontrado. Iniciando descarga...');
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Libre Commit',
        cancellable: false,
      },
      async (progress) => {
        await downloadModel(progress);
      }
    );
  } else {
    console.log('[LibreCommit] Modelo ya descargado en:', modelPath);
  }

  console.log('[LibreCommit] Cargando modelo en memoria...');
  const llama = await getLlama();
  model = await llama.loadModel({
    modelPath: modelPath,
  });

  console.log('[LibreCommit] Creando contexto (sin system prompt para modelo base)...');
  context = await model.createContext();
  contextSequence = context.getSequence(); // Obtener secuencia reutilizable

  console.log('[LibreCommit] Modelo cargado exitosamente!');
  vscode.window.showInformationMessage('Modelo Qwen2.5-Coder 0.5B Base cargado correctamente!');
}

async function ask(question: string): Promise<string> {
  if (!contextSequence || !model) throw new Error('Modelo no inicializado');

  const prompt = `Question: ${question}\nAnswer:`;

  // Limpiar la secuencia antes de usar
  await contextSequence.clearHistory();

  const completion = new LlamaCompletion({
    contextSequence: contextSequence,
  });

  const result = await completion.generateCompletion(prompt, {
    maxTokens: 15,
    temperature: 0.1,
    topP: 0.9,
  });

  return result.trim();
}

async function generateCommit(diff: string): Promise<string> {
  if (!contextSequence || !model) throw new Error('Modelo no inicializado');

  // Procesar el diff de manera inteligente
  const diffLines = diff.split('\n');

  // Extraer información relevante del diff
  const fileChanges: string[] = [];
  const relevantLines: string[] = [];
  const addedLines: string[] = [];
  const removedLines: string[] = [];

  for (const line of diffLines) {
    // Capturar nombres de archivos
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*?) b\/(.*?)$/);
      if (match) fileChanges.push(match[2] || match[1]);
    }
    // Capturar líneas añadidas/eliminadas (ignorar metadata)
    else if (
      (line.startsWith('+') || line.startsWith('-')) &&
      !line.startsWith('+++') &&
      !line.startsWith('---')
    ) {
      relevantLines.push(line);
      if (line.startsWith('+')) {
        addedLines.push(line);
      } else if (line.startsWith('-')) {
        removedLines.push(line);
      }
    }
  }

  // Crear un resumen del diff más compacto pero con más contexto
  const fileSummary = fileChanges.join(', ');
  const changesSummary = relevantLines.slice(0, 80).join('\n'); // Incrementado a 80 líneas

  const compactDiff = `Files: ${fileSummary}\n\nChanges:\n${changesSummary}`;

  // Limitar longitud total con más espacio para contexto
  const maxDiffLength = 4000; // Incrementado para mejor contexto
  const truncatedDiff =
    compactDiff.length > maxDiffLength
      ? compactDiff.substring(0, maxDiffLength) + '\n...(more changes)'
      : compactDiff;

  // Prompt optimizado para modelo BASE - sin scope (paréntesis)
  const prompt = `Write a conventional commit message for each diff:

### Example 1:
diff --git a/package.json b/package.json
+  "type": "module"
commit: chore: add module type

### Example 2:
diff --git a/src/Button.tsx b/src/Button.tsx
-  const size = 20;
+  const size = 16;
commit: refactor: reduce size from 20 to 16

### Your turn:
diff --git a/${fileChanges[0]} b/${fileChanges[0]}
${changesSummary.substring(0, 200)}
commit:`;

  console.log('[LibreCommit] Prompt enviado al modelo:');
  console.log('[LibreCommit] Diff truncado (primeros 500 chars):', truncatedDiff.substring(0, 500));
  console.log('[LibreCommit] Files detectados:', fileChanges);

  // Limpiar la secuencia antes de usar para evitar "No sequences left"
  await contextSequence.clearHistory();

  // Usar LlamaCompletion para generación directa sin system prompt
  const completion = new LlamaCompletion({
    contextSequence: contextSequence,
  });

  const message = await completion.generateCompletion(prompt, {
    maxTokens: 50,
    temperature: 0.3,
    topP: 0.9,
    topK: 40,
    customStopTriggers: ['\n\n', '###', 'diff --git'], // Detener si genera más ejemplos
  });

  console.log('[LibreCommit] Respuesta raw del modelo:', message);

  // Limpiar la respuesta
  let cleaned = message.trim();

  // Remover texto extra que el modelo pueda generar
  const messageLines = cleaned.split('\n');
  cleaned = messageLines[0].trim();

  // Post-procesamiento: corregir add/remove basándose en el diff real
  const hasOnlyAdditions = addedLines.length > 0 && removedLines.length === 0;
  const hasOnlyRemovals = removedLines.length > 0 && addedLines.length === 0;

  if (hasOnlyRemovals && cleaned.includes('add ')) {
    // El diff solo tiene eliminaciones pero el mensaje dice "add"
    cleaned = cleaned.replace(/\badd\b/g, 'remove');
  } else if (hasOnlyAdditions && cleaned.includes('remove ')) {
    // El diff solo tiene adiciones pero el mensaje dice "remove"
    cleaned = cleaned.replace(/\bremove\b/g, 'add');
  }

  // Si el modelo no generó un formato válido, crear uno basado en análisis del diff
  if (!cleaned.match(/^(feat|fix|docs|style|refactor|test|chore|perf)(\(.+\))?:/)) {
    // Análisis detallado del diff
    const fallbackLines = diff.split('\n');
    const addedLines = fallbackLines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const removedLines = fallbackLines.filter((l) => l.startsWith('-') && !l.startsWith('---'));

    // Extraer contenido de las líneas modificadas
    const addedContent = addedLines.map((l) => l.substring(1).trim()).join(' ');
    const removedContent = removedLines.map((l) => l.substring(1).trim()).join(' ');

    const hasHtml = diff.includes('.html');
    const hasCss = diff.includes('.css');
    const hasJs = diff.includes('.js') || diff.includes('.ts') || diff.includes('.mts');
    const hasJson = diff.includes('.json') || diff.includes('package.json');
    const hasMd = diff.includes('.md') || diff.includes('README');

    let type = 'chore';
    let description = 'update files';

    // Análisis específico para HTML
    if (hasHtml) {
      if (removedContent.includes('meta') && addedLines.length === 0) {
        type = 'refactor';
        // Intentar extraer qué meta tag específicamente
        const metaName =
          removedContent.match(/name=["']([^"']+)["']/)?.[1] ||
          removedContent.match(/property=["']([^"']+)["']/)?.[1];
        if (metaName) {
          description = `remove ${metaName} meta tag`;
        } else if (removedContent.includes('apple-mobile-web-app')) {
          description = 'remove apple mobile web app meta tag';
        } else {
          description = 'remove meta tag';
        }
      } else if (addedContent.includes('meta') && removedLines.length === 0) {
        type = 'feat';
        const metaName = addedContent.match(/name=["']([^"']+)["']/)?.[1];
        description = metaName ? `add ${metaName} meta tag` : 'add meta tag';
      } else if (removedContent.includes('<') || addedContent.includes('<')) {
        type = 'refactor';
        description = 'update html structure';
      } else {
        type = 'refactor';
        description = 'update content';
      }
    } else if (hasCss) {
      type = 'style';
      description =
        removedLines.length > addedLines.length
          ? 'remove styles'
          : addedLines.length > removedLines.length
            ? 'add styles'
            : 'update styles';
    } else if (hasJs) {
      // Análisis más detallado para JavaScript/TypeScript
      const hasReact =
        diff.includes('jsx') ||
        diff.includes('tsx') ||
        diff.includes('useState') ||
        diff.includes('useEffect') ||
        diff.includes('Component');

      // Detectar React para mejor descripción
      // (no usamos scope pero ayuda para contexto)

      // Detectar cambios de valores numéricos (parámetros, configuración)
      const numericChange = removedContent.match(/\d+/) && addedContent.match(/\d+/);
      const removedNum = removedContent.match(/\d+/)?.[0];
      const addedNum = addedContent.match(/\d+/)?.[0];

      // Detectar eliminación de líneas en blanco
      const onlyWhitespaceRemoved =
        removedLines.length > 0 &&
        removedLines.every((l) => l.substring(1).trim() === '') &&
        addedLines.length === 0;

      // Detectar cambios en imports
      const importChange = removedContent.includes('import') || addedContent.includes('import');

      if (onlyWhitespaceRemoved) {
        type = 'style';
        description = 'remove extra whitespace';
      } else if (numericChange && removedNum !== addedNum) {
        type = 'perf';
        // Intentar detectar qué parámetro cambió
        if (removedContent.includes('Float32Array') || addedContent.includes('Float32Array')) {
          const oldVal = parseInt(removedNum || '0');
          const newVal = parseInt(addedNum || '0');
          if (newVal < oldVal) {
            description = `reduce array size from ${removedNum} to ${addedNum}`;
          } else {
            description = `increase array size from ${removedNum} to ${addedNum}`;
          }
        } else if (removedContent.includes('radius') || addedContent.includes('radius')) {
          description = `update radius to ${addedNum}`;
        } else {
          description = `update value from ${removedNum} to ${addedNum}`;
        }
      } else if (importChange) {
        type = 'refactor';
        description = addedLines.length > removedLines.length ? 'add import' : 'update imports';
      } else if (addedLines.length > removedLines.length * 2) {
        type = 'feat';
        description = 'add functionality';
      } else if (removedLines.length > addedLines.length * 2) {
        type = 'refactor';
        description = 'remove code';
      } else {
        type = 'refactor';
        description = 'update logic';
      }
    } else if (hasJson) {
      type = 'chore';

      const hasPackageManager = diff.includes('packageManager');
      const hasScripts =
        diff.includes('scripts') || addedContent.includes('dev') || removedContent.includes('dev');
      const hasDeps = diff.includes('dependencies') || diff.includes('devDependencies');

      // Detectar múltiples cambios
      const changes: string[] = [];

      if (hasDeps) {
        changes.push('update dependencies');
      }

      if (hasPackageManager) {
        const version =
          addedContent.match(/pnpm@([\d.]+)/)?.[1] ||
          addedContent.match(/npm@([\d.]+)/)?.[1] ||
          addedContent.match(/yarn@([\d.]+)/)?.[1];
        const manager = addedContent.match(/"packageManager":\s*"(\w+)@/)?.[1];
        if (manager && version) {
          changes.push(`add ${manager}@${version}`);
        } else {
          changes.push('add package manager');
        }
      }

      if (hasScripts) {
        // Analizar cambios en scripts
        const scriptChanges =
          addedLines.filter((l) => l.includes(':') && !l.includes('packageManager')).length -
          removedLines.filter((l) => l.includes(':') && !l.includes('packageManager')).length;

        if (scriptChanges > 0) {
          changes.push('add scripts');
        } else if (scriptChanges < 0) {
          changes.push('remove scripts');
        } else {
          // Buscar qué script cambió
          const changedScript =
            addedContent.match(/"(\w+)":\s*"[^"]*"/)?.[1] ||
            removedContent.match(/"(\w+)":\s*"[^"]*"/)?.[1];
          if (changedScript) {
            if (removedContent.includes('--open') && !addedContent.includes('--open')) {
              changes.push(`remove --open from ${changedScript}`);
            } else if (addedContent.includes('--open') && !removedContent.includes('--open')) {
              changes.push(`add --open to ${changedScript}`);
            } else {
              changes.push(`update ${changedScript} script`);
            }
          }
        }
      }

      if (changes.length === 0) {
        description = 'update config';
      } else if (changes.length === 1) {
        description = changes[0];
      } else {
        // Múltiples cambios: combinar de forma inteligente
        description = changes.join(' and ');
      }
    } else if (hasMd) {
      type = 'docs';
      description = 'update documentation';
    }

    // Sin scope - formato simple: type: description
    cleaned = `${type}: ${description}`;
  }

  return cleaned;
}

async function getWorkspaceRoot(): Promise<string | undefined> {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const folder = vscode.workspace.getWorkspaceFolder(active);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

async function getStagedDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git diff --cached --no-ext-diff', { cwd });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Error obteniendo diff: ${(error as Error).message}`);
  }
}

async function commitWithMessage(cwd: string, message: string): Promise<void> {
  try {
    // Escapar comillas en el mensaje
    const escapedMessage = message.replace(/"/g, '\\"');
    await execAsync(`git commit -m "${escapedMessage}"`, { cwd });
  } catch (error) {
    throw new Error(`Error al crear commit: ${(error as Error).message}`);
  }
}

function startServer(): void {
  console.log('[LibreCommit] Iniciando servidor HTTP...');

  httpServer = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/ask' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { question } = JSON.parse(body);
          if (!question) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Requiere "question"' }));
            return;
          }

          console.log('[LibreCommit] Pregunta recibida:', question);
          const start = Date.now();
          const answer = await ask(question);
          const time = ((Date.now() - start) / 1000).toFixed(2);

          console.log('[LibreCommit] Respuesta generada en', time, 's');
          res.end(
            JSON.stringify({
              answer,
              model: 'Qwen2.5-Coder-0.5B-Base-Q4_K_M',
              time: `${time}s`,
            })
          );
        } catch (error: unknown) {
          console.error('[LibreCommit] Error en /ask:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    } else if (req.url === '/commit' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { diff } = JSON.parse(body);
          if (!diff) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Requiere "diff"' }));
            return;
          }

          console.log('[LibreCommit] Generando commit para diff de', diff.length, 'caracteres');
          const start = Date.now();
          const message = await generateCommit(diff);
          const time = ((Date.now() - start) / 1000).toFixed(2);

          console.log('[LibreCommit] Commit generado en', time, 's:', message);
          res.end(
            JSON.stringify({
              message,
              model: 'Qwen2.5-Coder-0.5B-Base-Q4_K_M',
              time: `${time}s`,
            })
          );
        } catch (error: unknown) {
          console.error('[LibreCommit] Error en /commit:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    } else if (req.url === '/health') {
      res.end(
        JSON.stringify({
          status: 'ok',
          modelLoaded: !!model && !!context,
        })
      );
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  httpServer.listen(7001, () => {
    console.log('[LibreCommit] Servidor HTTP escuchando en puerto 7001');
    vscode.window.showInformationMessage('Servidor iniciado en http://localhost:7001');
  });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('[LibreCommit] Activando extensión...');

  modelDir = path.join(context.globalStorageUri.fsPath, 'models');
  modelPath = path.join(modelDir, 'qwen2.5-coder-0.5b-base-q4_k_m.gguf');

  console.log('[LibreCommit] Directorio de modelos:', modelDir);
  console.log('[LibreCommit] Ruta del modelo:', modelPath);

  try {
    await initModel();
    startServer();
  } catch (error) {
    console.error('[LibreCommit] Error fatal al inicializar:', error);
    vscode.window.showErrorMessage(`Error al inicializar: ${(error as Error).message}`);
  }

  const askCommand = vscode.commands.registerCommand('libre-commit.ask', async () => {
    const question = await vscode.window.showInputBox({
      prompt: 'Pregunta algo al modelo',
      placeHolder: 'Ej: What is the capital of Spain?',
    });

    if (!question) return;

    try {
      const answer = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Preguntando al modelo...',
          cancellable: false,
        },
        async () => {
          return await ask(question);
        }
      );

      vscode.window.showInformationMessage(`Respuesta: ${answer}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
    }
  });

  const generateCommitCommand = vscode.commands.registerCommand(
    'libre-commit.generateCommit',
    async () => {
      console.log('[LibreCommit] Comando generateCommit ejecutado');

      const root = await getWorkspaceRoot();
      if (!root) {
        vscode.window.showErrorMessage('No hay carpeta de proyecto abierta.');
        return;
      }

      console.log('[LibreCommit] Workspace root:', root);

      let diff = '';
      try {
        diff = await getStagedDiff(root);
      } catch (error) {
        vscode.window.showErrorMessage(`Error obteniendo cambios: ${(error as Error).message}`);
        return;
      }

      if (!diff) {
        vscode.window.showInformationMessage('No hay cambios staged. Usa "git add" primero.');
        return;
      }

      console.log('[LibreCommit] Diff obtenido, longitud:', diff.length);

      try {
        const commitMessage = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generando mensaje de commit con AI...',
            cancellable: false,
          },
          async () => {
            return await generateCommit(diff);
          }
        );

        console.log('[LibreCommit] Mensaje generado:', commitMessage);

        // Obtener la extensión de Git de VSCode
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) {
          vscode.window.showErrorMessage('Extensión de Git no encontrada');
          return;
        }

        const api = gitExtension.getAPI(1);
        const repo = api.repositories[0];

        if (!repo) {
          vscode.window.showErrorMessage('No se encontró repositorio Git');
          return;
        }

        // Escribir el mensaje directamente en el Source Control
        repo.inputBox.value = commitMessage;

        vscode.window.showInformationMessage(
          'Mensaje de commit generado! Revísalo en Source Control'
        );
        console.log('[LibreCommit] Mensaje escrito en Source Control');
      } catch (error) {
        console.error('[LibreCommit] Error:', error);
        vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
      }
    }
  );

  context.subscriptions.push(askCommand, generateCommitCommand);
}

export function deactivate() {
  if (httpServer) {
    httpServer.close();
  }
}
