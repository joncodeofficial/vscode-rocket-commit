/**
 * Configuration constants for the Libre Commit extension
 */

export const MODEL_URL =
  'https://huggingface.co/mradermacher/Qwen2.5-Coder-1.5B-GGUF/resolve/main/Qwen2.5-Coder-1.5B.Q4_K_M.gguf';

export const MODEL_NAME = 'Qwen2.5-Coder-1.5B-Base-Q4_K_M';

export const MODEL_FILENAME = 'qwen2.5-coder-1.5b-base-q4_k_m.gguf';

export const HTTP_SERVER_PORT = 7001;

export const MODEL_CONFIG = {
  maxTokens: 80,
  temperature: 0.4,
  topP: 0.95,
  topK: 50,
  customStopTriggers: ['\n\n', '###', 'diff --git', 'Examples:', 'Now generate'],
};

export const WORD_COUNT_LIMITS = {
  min: 7,
  max: 12,
};

export const DIFF_CONFIG = {
  maxLines: 80,
  maxDiffLength: 4000,
};
