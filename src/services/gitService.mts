import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export async function getWorkspaceRoot(): Promise<string | undefined> {
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

export async function getStagedDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git diff --cached --no-ext-diff', { cwd });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Error obteniendo diff: ${(error as Error).message}`);
  }
}

export async function commitWithMessage(cwd: string, message: string): Promise<void> {
  try {
    const escapedMessage = message.replace(/"/g, '\\"');
    await execAsync(`git commit -m "${escapedMessage}"`, { cwd });
  } catch (error) {
    throw new Error(`Error al crear commit: ${(error as Error).message}`);
  }
}

export async function writeToSourceControl(commitMessage: string): Promise<void> {
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (!gitExtension) {
    throw new Error('Extensión de Git no encontrada');
  }

  const api = gitExtension.getAPI(1);
  const repo = api.repositories[0];

  if (!repo) {
    throw new Error('No se encontró repositorio Git');
  }

  repo.inputBox.value = commitMessage;
}
