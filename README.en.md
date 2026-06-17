# Video Pilot

Video Pilot is an open-source desktop workspace for AI-assisted video editing. It combines a Next.js editor, an Electron shell, a FastAPI backend, Remotion preview playback, and local project storage.

> The current application UI is Chinese-first. English documentation is provided as a reference for future internationalization and contributors who prefer English.

## Languages

- 简体中文: [README.md](./README.md)
- English: [README.en.md](./README.en.md)

More translations are welcome. If you would like to help maintain another language version, please open an issue or pull request.

## Features

- Local project folders with portable project manifests.
- Visual-model analysis for building a searchable media library from imported clips.
- Per-clip scoring and structured parameters, so materials can be compared by quality, content, shot type, motion, transcript, and editing value.
- Media grouping and segmenting workflows, with notes on each segment for planning, review, and rough-cut decisions.
- Language-model and speech-recognition workflows for detecting spoken language and text content inside source material.
- Script AI assistant for arranging selected clips into draft timelines and rough-cut structures.
- OpenAI-compatible model settings for local or remote visual, language, speech-to-text, and text-to-speech endpoints.
- SQLite-backed local settings and recent project state.
- Electron desktop shell for local folder access.

## Requirements

- Node.js 20 or newer.
- Python 3.11 or newer.
- ffmpeg is recommended for media analysis and frame extraction.
- macOS is recommended for MLX Whisper. Linux and Windows can still run the app with remote OpenAI-compatible services or their own local compatible endpoints.

## Quick Start

```bash
npm run pilot
```

The command installs JavaScript dependencies, creates `backend/.venv`, installs Python dependencies, initializes `backend/storage/app.db`, asks for a local or remote OpenAI-compatible model profile, and starts the backend, worker, Next.js frontend, and Electron app.

Useful variants:

```bash
npm run pilot:setup
npm run pilot:check
```

Advanced development commands remain available:

```bash
npm run backend:dev
npm run backend:worker
npm --prefix frontend run dev
npm run electron
```

## Model Configuration

Video Pilot stores model settings in the local SQLite database at `backend/storage/app.db`.

- Local profile: `http://127.0.0.1:8000/v1`, no API key required. Use this for Ollama, LM Studio, vLLM, mlx-lm server, or another OpenAI-compatible local service.
- Remote profile: `https://api.openai.com/v1`, API key required. The key is stored only in the local SQLite database and is not returned by the settings API.

The repository does not include model weights. Download MLX Whisper or other local models separately and keep them outside Git-tracked source files.

## Privacy And Local Data

Do not commit:

- `.env` files or API keys.
- `backend/storage/` databases, logs, exports, media, or project runtime data.
- User video/audio files.
- Downloaded model weights under `backend/models/`.

The `.gitignore` file excludes these paths by default.

## Repository Layout

- `frontend/`: Next.js editor UI.
- `electron/`: Electron main and preload processes.
- `backend/`: FastAPI API, worker, project storage, AI service adapters.
- `scripts/pilot.mjs`: cross-platform bootstrap and launch command.

## Open Source Note

This is my first open-source project. I am still learning how to use GitHub to manage issues, pull requests, releases, and long-term community iteration. If you notice unclear documentation, missing contribution workflows, or better ways to organize the project, please share feedback in issues. Suggestions about open-source governance and project management are especially welcome.

## Contributing

Video Pilot is intended to be built with community contributions. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

All changes should go through pull requests, pass CI, and receive maintainer review before merge. The default merge strategy is squash merge.

## License

Video Pilot is released under the MIT License. Third-party dependencies, models, media, Remotion, MLX Whisper, and other external tools remain governed by their own licenses.
