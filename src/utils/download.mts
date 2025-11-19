import * as vscode from 'vscode';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';

export async function downloadModelWithProgress(
  url: string,
  destPath: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  progress.report({ message: 'Descargando Qwen2.5-Coder 1.5B Base Q4_K_M (~1.1 GB)...' });

  const destDir = path.dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  console.log('[LibreCommit] Iniciando descarga del modelo desde:', url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error al descargar: ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let downloadedBytes = 0;

  console.log('[LibreCommit] Tamaño del modelo:', (totalBytes / 1024 / 1024).toFixed(2), 'MB');

  const reader = response.body!.getReader();
  const writer = createWriteStream(destPath);

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

  console.log('[LibreCommit] Descarga completada. Archivo guardado en:', destPath);
  progress.report({ message: 'Descarga completada!' });
}
