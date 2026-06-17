# Security Policy

Video Pilot stores local runtime data on the developer's machine. Treat API keys, local databases, and user media as private.

## Do Not Commit

- `.env` files.
- API keys, tokens, passwords, or credentials.
- `backend/storage/` databases, logs, exports, or imported media.
- User project folders or user video/audio/image files.
- Downloaded model weights.

## Reporting Security Issues

Please do not open a public issue for a vulnerability or private data exposure. Contact the maintainers privately with:

- A short description of the issue.
- Steps to reproduce.
- Impact and affected versions or commits, if known.

## Local Model Keys

Remote model API keys are stored in `backend/storage/app.db`. The settings API returns only whether a key is configured; it must not return the key value.
