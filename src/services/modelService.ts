import * as vscode from 'vscode';
import { getLlama, LlamaContext, LlamaModel, LlamaCompletion } from 'node-llama-cpp';
import { existsSync } from 'fs';
import { MODEL_URL, MODEL_CONFIG, MODEL_NAME } from '../constants/config.js';
import { downloadModelWithProgress } from '../utils/download.js';

let model: LlamaModel | null = null;
let context: LlamaContext | null = null;
let contextSequence: any = null;

export async function initModel(modelPath: string): Promise<void> {
  if (!existsSync(modelPath)) {
    console.log('[RocketCommit] Modelo no encontrado. Iniciando descarga...');
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Rocket Commit',
        cancellable: false,
      },
      async (progress) => {
        await downloadModelWithProgress(MODEL_URL, modelPath, progress);
      }
    );
  } else {
    console.log('[RocketCommit] Modelo ya descargado en:', modelPath);
  }

  console.log('[RocketCommit] Cargando modelo en memoria...');
  const llama = await getLlama();
  model = await llama.loadModel({
    modelPath: modelPath,
  });

  console.log('[RocketCommit] Creando contexto con modelo Base (completion mode)...');
  context = await model.createContext();
  contextSequence = context.getSequence();

  console.log('[RocketCommit] Modelo cargado exitosamente!');
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
    '../utils/promptBuilder.js'
  ).then((m) => m.buildCommitPrompt(diff));

  console.log('[RocketCommit] Prompt enviado al modelo:');

  await contextSequence.clearHistory();

  const completion = new LlamaCompletion({
    contextSequence: contextSequence,
  });

  const message = await completion.generateCompletion(prompt, MODEL_CONFIG);

  console.log('[RocketCommit] Respuesta raw del modelo:', message);

  const { processCommitMessage } = await import('../utils/commitProcessor.js');
  const cleaned = await processCommitMessage(message, diff, addedLines, removedLines, changeType);

  return cleaned;
}

export function getModelName(): string {
  return MODEL_NAME;
}
