import * as vscode from 'vscode';
import { getLlama, LlamaContext, LlamaModel, LlamaCompletion } from 'node-llama-cpp';
import { existsSync } from 'fs';
import { MODEL_URL, MODEL_CONFIG, MODEL_NAME } from '../constants/config.js';
import { downloadModelWithProgress } from '../utils/download.mjs';

let model: LlamaModel | null = null;
let context: LlamaContext | null = null;
let contextSequence: any = null;

export async function initModel(modelPath: string): Promise<void> {
  if (!existsSync(modelPath)) {
    console.log('[LibreCommit] Modelo no encontrado. Iniciando descarga...');
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Libre Commit',
        cancellable: false,
      },
      async (progress) => {
        await downloadModelWithProgress(MODEL_URL, modelPath, progress);
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

  console.log('[LibreCommit] Creando contexto con modelo Base (completion mode)...');
  context = await model.createContext();
  contextSequence = context.getSequence();

  console.log('[LibreCommit] Modelo cargado exitosamente!');
}

export async function ask(question: string): Promise<string> {
  if (!contextSequence || !model) throw new Error('Modelo no inicializado');

  const prompt = `Question: ${question}\nAnswer:`;

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

export async function generateCommit(diff: string): Promise<string> {
  if (!contextSequence || !model) throw new Error('Modelo no inicializado');

  const { prompt, addedLines, removedLines, changeType } = await import(
    '../utils/promptBuilder.mjs'
  ).then((m) => m.buildCommitPrompt(diff));

  console.log('[LibreCommit] Prompt enviado al modelo:');

  await contextSequence.clearHistory();

  const completion = new LlamaCompletion({
    contextSequence: contextSequence,
  });

  const message = await completion.generateCompletion(prompt, MODEL_CONFIG);

  console.log('[LibreCommit] Respuesta raw del modelo:', message);

  const { processCommitMessage } = await import('../utils/commitProcessor.mjs');
  const cleaned = await processCommitMessage(message, diff, addedLines, removedLines, changeType);

  return cleaned;
}

export function getModelName(): string {
  return MODEL_NAME;
}
