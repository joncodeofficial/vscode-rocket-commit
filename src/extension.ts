import * as vscode from 'vscode';
import path from 'path';
import { initModel } from './services/modelService.js';
import { startServer, stopServer } from './services/httpServer.js';
import { MODEL_FILENAME } from './constants/config.js';
import { handleGenerateCommit } from './commands/generateCommitCommand.js';

export async function activate(context: vscode.ExtensionContext) {
  console.log('[RocketCommit] Activando extensión...');

  const modelDir = path.join(context.globalStorageUri.fsPath, 'models');
  const modelPath = path.join(modelDir, MODEL_FILENAME);

  console.log('[RocketCommit] Directorio de modelos:', modelDir);
  console.log('[RocketCommit] Ruta del modelo:', modelPath);

  try {
    await initModel(modelPath);
    startServer();
  } catch (error) {
    console.error('[RocketCommit] Error fatal al inicializar:', error);
    vscode.window.showErrorMessage(`Error al inicializar: ${(error as Error).message}`);
  }

  // Registrar comando para el botón de rocket en Source Control
  const generateCommitCommand = vscode.commands.registerCommand(
    'rocket-commit.generateCommit',
    handleGenerateCommit
  );

  context.subscriptions.push(generateCommitCommand);
}

export function deactivate() {
  stopServer();
}
