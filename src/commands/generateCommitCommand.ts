import * as vscode from 'vscode';
import { generateCommit } from '../services/modelService.js';
import { getWorkspaceRoot, getStagedDiff, writeToSourceControl } from '../services/gitService.js';

export async function handleGenerateCommit(): Promise<void> {
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
        location: vscode.ProgressLocation.SourceControl,
        title: 'Generando commit con AI...',
      },
      async () => {
        return await generateCommit(diff);
      }
    );

    console.log('[LibreCommit] Mensaje generado:', commitMessage);

    await writeToSourceControl(commitMessage);

    console.log('[LibreCommit] Mensaje escrito en Source Control');
  } catch (error) {
    console.error('[LibreCommit] Error:', error);
    vscode.window.showErrorMessage(`Error generando commit: ${(error as Error).message}`);
  }
}
