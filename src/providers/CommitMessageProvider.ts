import * as vscode from 'vscode';
import { generateCommit } from '../services/modelService.js';
import { getStagedDiff } from '../services/gitService.js';

export class CommitMessageProvider {
  async provideValue(
    repository: any,
    _token: vscode.CancellationToken
  ): Promise<string | undefined> {
    try {
      console.log('[LibreCommit] Generando mensaje desde Source Control...');

      const diff = await getStagedDiff(repository.rootUri.fsPath);

      if (!diff) {
        vscode.window.showInformationMessage('No hay cambios staged para generar commit.');
        return undefined;
      }

      console.log('[LibreCommit] Diff obtenido, longitud:', diff.length);

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

      return commitMessage;
    } catch (error) {
      console.error('[LibreCommit] Error generando mensaje:', error);
      vscode.window.showErrorMessage(`Error al generar commit: ${(error as Error).message}`);
      return undefined;
    }
  }
}
