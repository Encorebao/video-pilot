# Contributing to Video Pilot

Video Pilot is built through pull requests and maintainer review. Direct pushes to `main` are not part of the public contribution workflow.

## Workflow

1. Fork the repository.
2. Create a branch:
   - `feature/<short-name>`
   - `fix/<short-name>`
   - `documentation/<short-name>`
   - `chore/<short-name>`
3. Make focused changes.
4. Run the relevant checks.
5. Open a pull request.
6. Wait for CI and maintainer review.

The default merge strategy is squash merge.

## Required Checks

Run the checks that match your change:

```bash
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
cd backend && .venv/bin/python -m pytest tests -q
```

For bootstrap changes, also run:

```bash
npm run pilot:check
```

## Privacy Rules

Before opening a pull request, confirm that you did not commit:

- API keys, tokens, passwords, or `.env` files.
- Local SQLite databases from `backend/storage/`.
- User video, audio, image, or project files.
- Downloaded model weights under `backend/models/`.

## Pull Request Expectations

Every pull request should include:

- What changed.
- Why it changed.
- How it was tested.
- Any model, media, migration, or compatibility notes.

Large features should be split into smaller reviewable pull requests.
