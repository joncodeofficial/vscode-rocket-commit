import * as vscode from 'vscode';
import path from 'path';
import { initModel } from './services/modelService.mjs';
import { startServer, stopServer } from './services/httpServer.mjs';
import { MODEL_FILENAME } from './constants/config.mjs';
import { handleGenerateCommit } from './commands/generateCommitCommand.mjs';

export async function activate(context: vscode.ExtensionContext) {
  console.log('[LibreCommit] Activando extensión...');

  const modelDir = path.join(context.globalStorageUri.fsPath, 'models');
  const modelPath = path.join(modelDir, MODEL_FILENAME);

  console.log('[LibreCommit] Directorio de modelos:', modelDir);
  console.log('[LibreCommit] Ruta del modelo:', modelPath);

  try {
    await initModel(modelPath);
    startServer();
  } catch (error) {
    console.error('[LibreCommit] Error fatal al inicializar:', error);
    vscode.window.showErrorMessage(`Error al inicializar: ${(error as Error).message}`);
  }

  // Registrar comando para el botón de rocket en Source Control
  const generateCommitCommand = vscode.commands.registerCommand(
    'libre-commit.generateCommit',
    handleGenerateCommit
  );

  context.subscriptions.push(generateCommitCommand);
}

export function deactivate() {
  stopServer();
}
