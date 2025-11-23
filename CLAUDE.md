# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rocket Commit is a VSCode extension that generates AI-powered commit messages using a local LLM (Qwen2.5-Coder-1.5B). The extension runs entirely offline after initial model download, ensuring complete privacy.

## Development Commands

### Build and Compilation

```bash
npm run compile          # Compile TypeScript to dist/
npm run watch           # Watch mode for development
npm run package         # Create .vsix extension package
```

### Code Quality

```bash
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix linting issues
npm run format          # Format code with Prettier
npm run format:check    # Check formatting without changes
npm test               # Run VSCode extension tests
```

### Git Hooks

The project uses `simple-git-hooks`:

- **pre-commit**: Runs `lint-staged` (formats code and sorts package.json)
- **commit-msg**: Validates commit messages with commitlint

## Architecture

### Core Flow: Commit Message Generation

1. **User triggers** via rocket button in Source Control or command palette
2. **gitService.ts** retrieves staged diff (`git diff --cached`)
3. **promptBuilder.ts** processes diff:
   - Filters noise (empty lines, brackets, simple comments)
   - Detects change patterns (restored code, refactors, numeric changes)
   - Truncates diff to max 4000 chars, 80 lines
   - Builds specialized prompt with examples
4. **modelService.ts** manages LLM:
   - Downloads model on first run (~900MB)
   - Maintains context sequence for completions
   - Generates commit message (80 tokens max)
5. **commitProcessor.mts** post-processes output:
   - Filters garbage (SHA hashes, metadata)
   - Validates conventional commit format
   - Corrects verb tense (added → add)
   - Ensures 7-12 word count
   - Fixes type based on detected patterns
6. **gitService.ts** writes message to Source Control input box

### Key Components

**Extension Lifecycle** (`extension.ts`)

- Activates on startup
- Downloads/loads model at `globalStorageUri/models/`
- Starts HTTP server on port 7001 (for testing/debugging)
- Registers command `rocket-commit.generateCommit`

**Model Management** (`modelService.ts`)

- Uses `node-llama-cpp` for local inference
- Model: Qwen2.5-Coder-1.5B Q4_K_M quantization
- Config: temp=0.4, topP=0.95, topK=50, maxTokens=80
- Progress UI shown during model download

**Pattern Detection** (`promptBuilder.ts`)

- **Restored code**: Uncommented lines (// removed) → type `fix`
- **Refactor**: Old code commented + new imports + rewrites
- **Numeric changes**: Detects value changes (1000 → 300) → suggests `perf:`
- **Change types**: added, removed, modified, restored, refactor

**Message Processing** (`commitProcessor.mts`)

- Enforces conventional commits: `type: subject` (no scopes)
- Corrects imperative mood
- Validates against add/remove based on diff direction
- Expands very short messages (<3 words)
- Truncates long messages (>12 words)

**HTTP Server** (`httpServer.ts`)

- Endpoints: `/ask`, `/commit`, `/health`
- Used for testing model responses
- Port: 7001 (configurable in config.ts)

## Module System

This project uses **ES modules** (type: "module" in package.json):

- All imports must include `.js` extension (even for `.ts` files)
- Uses `.mts` for TypeScript ES modules that need explicit typing
- TypeScript compiles to `.mjs` in dist/
- Config: `"module": "Node16"` in tsconfig.json

## Important Constraints

### Logging Convention

All console logs use `[RocketCommit]` prefix for filtering/debugging.

### File Extensions in Imports

Always use `.js` in imports, not `.ts`:

```typescript
// Correct
import { foo } from '../utils/bar.js';

// Wrong
import { foo } from '../utils/bar';
```

### Commit Message Rules (enforced by AI)

- Types: feat, fix, refactor, style, chore, perf, docs, test
- No parentheses/scopes in format
- 7-12 words in description
- Imperative mood (add, remove, not added, removed)
- Accurate direction: "+" means added, "-" means removed
- For numeric changes: mention FROM → TO values

### Model Prompt Design

The prompt includes examples that demonstrate:

- Accurate add/remove semantics
- Numeric change descriptions (e.g., "from 1000 to 300")
- Restored code → fix type
- Console.log additions → chore/debug type

## Configuration Files

### Constants (`src/constants/config.ts`)

- `MODEL_URL`: HuggingFace download link
- `MODEL_FILENAME`: Local storage filename
- `HTTP_SERVER_PORT`: 7001
- `MODEL_CONFIG`: LLM generation params
- `WORD_COUNT_LIMITS`: min=7, max=12
- `DIFF_CONFIG`: maxLines=80, maxDiffLength=4000

### Commitlint

Extends `@commitlint/config-conventional` with:

- Max header length: 200 chars
- Subject case: disabled (allows any case)

### ESLint

- Enforces camelCase/PascalCase imports
- Requires semicolons
- Removes unused imports/vars
- Unused vars starting with `_` are allowed

## Testing the Extension

1. Press F5 in VSCode to launch Extension Development Host
2. Open a git repository
3. Stage some changes
4. Click rocket icon in Source Control or run "Generate Commit with AI"
5. Check logs in Debug Console for `[RocketCommit]` messages

## Deployment

The project uses semantic-release for automated versioning:

- Conventional commits determine version bump
- CHANGELOG.md auto-generated
- GitHub release created with .vsix asset
- Package published to VSCode Marketplace (manual step)

## Common Pitfalls

1. **Import paths**: Forgetting `.js` extension breaks module resolution
2. **Model not loaded**: First run requires internet for ~900MB download
3. **Empty diffs**: Extension only works with staged changes (`git add`)
4. **Spanish error messages**: Some user-facing messages still in Spanish (historical, being migrated to English)
5. **Mixed .mts/.ts**: Use `.mts` only when ESM typing is explicitly needed; prefer `.ts` for consistency

## Code Style

- **Comments**: English preferred, remove emojis
- **Logging**: Use `[RocketCommit]` prefix
- **Error messages**: Descriptive, mention context
- **Variable naming**: camelCase for vars/functions, PascalCase for classes/types
- **Line length**: No hard limit, but keep readable (~100 chars)
