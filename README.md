# Rocket Commit

**Generate intelligent commit messages with AI - 100% local and private**

Rocket Commit is a Visual Studio Code extension that uses local artificial intelligence to automatically generate descriptive commit messages based on your code changes. No internet connection or external APIs required after initial setup.

## ✨ Features

- 🤖 **Local AI**: Uses the Qwen2.5-Coder-1.5B model running entirely on your machine
- 🔒 **Total Privacy**: Your code never leaves your computer
- 📝 **Descriptive Commits**: Generates messages following commit conventions
- ⚡ **Fast and Efficient**: Optimized model (Q4_K_M) for performance
- 🚀 **Easy to Use**: One click from the Source Control panel
- 🌐 **Works Offline**: After downloading the model, no connection required

## 📋 Requirements

- Visual Studio Code v1.97.0 or higher
- Node.js (recommended: LTS version)
- Disk space: ~1GB for the AI model

## 🚀 Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Jonpena.rocket-commit)
2. On first use, the extension will automatically download the AI model (~900MB)
3. Ready to use!

## 💡 Usage

1. **Stage your changes**: Use `git add` to prepare the files you want to commit

   ```bash
   git add .
   ```

2. **Generate the message**: Click the rocket icon (🚀) in the Source Control toolbar

3. **Review and confirm**: The generated message will appear in the input box. Review it and commit

### From Command Palette

You can also use the command from the command palette (Ctrl/Cmd + Shift + P):

```
Generate Commit with AI
```

## 🔧 How It Works

1. **Analysis**: The extension obtains the diff of staged changes (`git diff --staged`)
2. **Processing**: Filters and cleans the diff to focus on relevant changes
3. **Generation**: The AI model analyzes the changes and generates a descriptive message
4. **Optimization**: Post-processes the message to comply with best practices

### Technologies Used

- **[node-llama-cpp](https://github.com/withcatai/node-llama-cpp)**: Runs LLM models locally in Node.js
- **[Qwen2.5-Coder-1.5B](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B)**: Code-specialized model
- **Q4_K_M Quantization**: Optimal balance between performance and quality

## 📐 Configuration

The model comes configured with optimized parameters:

```typescript
{
  maxTokens: 80,        // Maximum message length
  temperature: 0.4,     // Moderate creativity
  topP: 0.95,          // Response diversity
  topK: 50             // Number of candidate tokens
}
```

## 🗂️ Project Structure

```
vscode-rocket-commit/
├── src/
│   ├── commands/         # Extension commands
│   ├── services/         # Business logic (Git, AI, HTTP)
│   ├── providers/        # VSCode providers
│   ├── utils/           # Utilities and helpers
│   └── constants/       # Configuration and constants
├── images/              # Visual resources
└── dist/               # Compiled build
```

## 🤝 Contributing

Contributions are welcome! If you want to improve Rocket Commit:

1. Fork the repository
2. Create a branch for your feature (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Local Development

```bash
# Clone the repository
git clone https://github.com/joncodeofficial/vscode-rocket-commit.git

# Install dependencies
npm install

# Compile in watch mode
npm run watch

# Run tests
npm test

# Linting
npm run lint
```

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) to learn about changes in each version.

## 🐛 Report Issues

Found a bug? [Open an issue](https://github.com/joncodeofficial/vscode-rocket-commit/issues)

## 📄 License

This project is licensed under the Apache 2.0 License. See the [LICENSE](LICENSE) file for more details.

## 🙏 Acknowledgments

- [Qwen Team](https://github.com/QwenLM) for the Qwen2.5-Coder model
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) for the inference library
- The VSCode community for the tools and documentation

## 📧 Contact

Jonathan - [@joncodeofficial](https://github.com/joncodeofficial)

Project Link: [https://github.com/joncodeofficial/vscode-rocket-commit](https://github.com/joncodeofficial/vscode-rocket-commit)

---

**Like Rocket Commit?** ⭐ Star the repo and share it with other developers!
